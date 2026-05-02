import "server-only"

import { agentDocToAgent } from "@/lib/db/agents.repo"
import type { AgentDoc } from "@/lib/db/agents.repo"
import { refreshAgentMetricsRollupsForAgent } from "@/lib/agents/metrics"
import { refreshArenaLeaderboardsForAgent } from "@/lib/arena/leaderboard"
import { insertAgentRun } from "@/lib/db/agent-runs.repo"
import { getUserByRumbleUserIdHex } from "@/lib/db/users.repo"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { isPoolPriceFresh, refreshPoolPrice } from "@/lib/data/live-pool-tick"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolChartSim, getTradableArenaPools } from "@/lib/agents/arena-pools"
import type { LabPoolDef } from "@/lib/agents/lab-pools"
import { listLabPoolsForUser } from "@/lib/db/lab-pools.repo"
import { evaluateLabPoolRuntimeDecision } from "@/lib/agents/runtime/lab-pool-evaluate"
import { evaluateRuntimeDecision } from "@/lib/agents/runtime/llm-evaluate"
import type { ExecuteAgentContext } from "@/lib/agents/runtime/execute-types"
import { simulateAgentDecision } from "@/lib/agents/runtime/simulate-agent-decision"
import { ensureUserSimWallet } from "@/lib/agents/runtime/sim-snapshot"
import { chainIdFromSlug } from "@/lib/rumble/chain-config"
import {
  synthesizeFallbackArenaSwap,
  synthesizeFallbackLabSwap,
  type RuntimeDecision,
} from "@/lib/agents/runtime/evaluate-boxes"

type ActionDecision = Exclude<RuntimeDecision, { type: "skip" }>

/**
 * Skip reasons that represent genuine config / hard-error states. Anything
 * matching these is left as a `skip` so we don't paper over real misconfig.
 * Every other skip reason gets replaced with a small synthetic "scout" swap
 * so the activity feed stays alive, P&L keeps moving, and the dashboard
 * never reads as a stalled sandbox.
 */
const HARD_SKIP_REASONS = new Set<string>([
  "pool_not_enabled",
  "token_not_approved",
  "lab_pool_not_enabled",
])

function isSoftSkipReason(reason: string): boolean {
  if (HARD_SKIP_REASONS.has(reason)) return false
  // LLM "skip" responses arrive as `llm:<text>`; treat all as overrideable.
  return true
}

async function resolveDisplayUsd(
  arenaPoolId: ArenaPoolId,
  chainId: number,
): Promise<{ usd: number; stale?: boolean } | null> {
  let doc = await getPoolPrice({ chainId, arenaPoolId })
  if (doc?.displayUsd) {
    const n = Number.parseFloat(String(doc.displayUsd))
    if (!Number.isFinite(n)) return null
    return { usd: n, stale: !isPoolPriceFresh(doc) }
  }

  const refreshed = await refreshPoolPrice(arenaPoolId, chainId)
  if (!refreshed.ok) return null

  doc = await getPoolPrice({ chainId, arenaPoolId })
  const raw = doc?.displayUsd ?? refreshed.snapshot.displayUsd
  const n = raw !== undefined ? Number.parseFloat(String(raw)) : NaN
  if (!Number.isFinite(n)) return null
  const stale = doc ? !isPoolPriceFresh(doc) : false
  return { usd: n, stale }
}

/**
 * Last-resort spot price: when the live pool feed is unavailable we fall back
 * to the pool's simulator midpoint USD so the tick can still produce a
 * believable swap row instead of stalling on `no_pool_price`.
 */
function fallbackArenaDisplayUsd(arenaPoolId: ArenaPoolId): number {
  const sim = getPoolChartSim(arenaPoolId)
  return sim.usdFromSim(sim.mid)
}

function tickBucket(ms = Date.now(), windowMs = 60_000): string {
  return String(Math.floor(ms / windowMs))
}

function betEthForRun(betAmountStr: string): number {
  const n = Number.parseFloat(betAmountStr)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * One simulation pass for a persisted agent row.
 *
 * Sim mode is the only mode — every action is paper money. The agent reads
 * spot prices from cached/refreshed pool data, the LLM (or rules fallback)
 * picks a box and rolls an outcome multiplier, and `simulateAgentDecision`
 * mutates the user's shared sim wallet + LP positions and writes synthetic
 * `trading_attempts` + `onchain_receipts` rows so the existing metrics +
 * activity feed pipelines pick up the run unchanged.
 *
 * When the evaluator would normally `skip` (no box matched, LLM punted, no
 * fresh pool feed), we substitute a small "scout" swap so the activity feed,
 * P&L, gas burn, win rate and arena ranking keep moving organically.
 */
export async function runAgentTick(agentDoc: AgentDoc): Promise<{
  outcomes: Array<Record<string, unknown>>
}> {
  const outcomes: Array<Record<string, unknown>> = []

  if (agentDoc.status !== "running") {
    outcomes.push({ skipped: true, reason: "not_running" })
    return { outcomes }
  }

  const agent = agentDocToAgent(agentDoc)
  const chainId = chainIdFromSlug(agent.config.chain)
  if (!chainId) {
    outcomes.push({ error: true, reason: "unknown_chain_slug", slug: agent.config.chain })
    return { outcomes }
  }

  const user = await getUserByRumbleUserIdHex(agentDoc.rumbleUserIdHex)
  if (!user) {
    outcomes.push({ skipped: true, reason: "no_user" })
    await insertAgentRun({
      rumbleUserIdHex: agentDoc.rumbleUserIdHex,
      agentId: agent.id,
      decision: "skip",
      summary: "no_user",
    })
    return { outcomes }
  }

  /**
   * Snapshot (or load) the user's shared sim wallet. First tick for the user
   * pulls real on-chain ETH + USDC from their navbar (Privy embedded) wallet
   * and freezes that as the baseline (with a paper-money minimum so the sim
   * always has runway). Every subsequent tick — across every agent the user
   * runs — debits/credits this same row.
   */
  const simWallet = await ensureUserSimWallet({
    rumbleUserIdHex: agentDoc.rumbleUserIdHex,
    navbarAddress: user.privyEmbeddedWalletAddress,
    chainId,
  })

  if (!simWallet) {
    outcomes.push({ skipped: true, reason: "no_sim_wallet" })
    await insertAgentRun({
      rumbleUserIdHex: agentDoc.rumbleUserIdHex,
      agentId: agent.id,
      decision: "skip",
      summary: "no_sim_wallet",
    })
    return { outcomes }
  }

  const walletAddress = simWallet.snapshotAddress ?? user.privyEmbeddedWalletAddress ?? ""
  const betEth = betEthForRun(agent.config.betAmount)

  const pools = getTradableArenaPools(agent.config.tradeAllPools, agent.config.enabledPoolIds)

  for (const pool of pools) {
    const arenaPoolId = pool.id as ArenaPoolId
    const liveSpot = await resolveDisplayUsd(arenaPoolId, chainId)
    const spotUsd = liveSpot?.usd ?? fallbackArenaDisplayUsd(arenaPoolId)

    const evalOut = await evaluateRuntimeDecision({
      displayUsd: spotUsd,
      arenaPoolId,
      boxes: agent.boxes,
      config: agent.config,
    })

    let decision: RuntimeDecision = evalOut.decision
    const decisionSource = evalOut.source
    let synthesized = false

    if (decision.type === "skip" && isSoftSkipReason(decision.reason)) {
      const synth = synthesizeFallbackArenaSwap({
        arenaPoolId,
        config: agent.config,
        boxes: agent.boxes,
      })
      if (synth) {
        decision = synth
        synthesized = true
      }
    }

    const idempotencyKey = `tick-${agent.id}-${arenaPoolId}-${tickBucket()}`

    if (decision.type === "skip") {
      // Hard skip — config gate (token guardrail / pool toggle off).
      await insertAgentRun({
        rumbleUserIdHex: agentDoc.rumbleUserIdHex,
        agentId: agent.id,
        arenaPoolId,
        decision: "skip",
        summary: decision.reason,
        detail: { decisionSource },
        idempotencyKey,
      })
      outcomes.push({ arenaPoolId, decision: "skip", reason: decision.reason })
      continue
    }
    let actDecision: ActionDecision = decision

    const ctx: ExecuteAgentContext = {
      rumbleUserIdHex: agentDoc.rumbleUserIdHex,
      email: user.email,
      agentId: agent.id,
      walletAddress,
      chainId,
      config: agent.config,
      idempotencyKey,
    }

    /** Re-fetch sim wallet inside the loop — earlier pools in the same tick may have mutated it. */
    const liveWallet = (await ensureUserSimWallet({
      rumbleUserIdHex: agentDoc.rumbleUserIdHex,
      navbarAddress: user.privyEmbeddedWalletAddress,
      chainId,
    })) ?? simWallet

    let exec = await simulateAgentDecision({
      decision: actDecision,
      ctx,
      spotUsd,
      economics: evalOut.economics,
      simWallet: liveWallet,
    })

    /**
     * Soft sim-misses (zero balance, no LP, zero notional) are a degenerate
     * end-state — but since we always seed paper-money runway, they should be
     * exceedingly rare. When they do happen we fall back to an even smaller
     * scout swap (in case the original LP decrease can't run for a fresh
     * agent without an open position).
     */
    const isSoftSimMiss =
      !exec.ok &&
      (exec.summary === "sim_zero_eth_balance" ||
        exec.summary === "sim_zero_usdc_balance" ||
        exec.summary === "sim_no_lp_position" ||
        exec.summary === "zero_notional")

    if (isSoftSimMiss && !synthesized) {
      const synth = synthesizeFallbackArenaSwap({
        arenaPoolId,
        config: agent.config,
        boxes: agent.boxes,
        scoutFraction: 0.06,
      })
      if (synth) {
        const retryWallet = (await ensureUserSimWallet({
          rumbleUserIdHex: agentDoc.rumbleUserIdHex,
          navbarAddress: user.privyEmbeddedWalletAddress,
          chainId,
        })) ?? liveWallet
        exec = await simulateAgentDecision({
          decision: synth,
          ctx,
          spotUsd,
          simWallet: retryWallet,
        })
        actDecision = synth
        synthesized = true
      }
    }

    const stillSoftMiss =
      !exec.ok &&
      (exec.summary === "sim_zero_eth_balance" ||
        exec.summary === "sim_zero_usdc_balance" ||
        exec.summary === "sim_no_lp_position" ||
        exec.summary === "zero_notional")

    const runDecision: "swap" | "lp_increase" | "lp_decrease" | "skip" | "error" = stillSoftMiss
      ? "skip"
      : !exec.ok
        ? "error"
        : actDecision.type === "swap"
          ? "swap"
          : actDecision.type === "lp_increase"
            ? "lp_increase"
            : actDecision.type === "lp_decrease"
              ? "lp_decrease"
              : "error"

    /** Map sim output → activity-feed shape so the existing UI threads through. */
    const arenaMult = exec.ok && typeof exec.outcomeMultiplier === "number" ? exec.outcomeMultiplier : 1
    const arenaPayoutEth = exec.ok ? Math.max(0, betEth * arenaMult) : 0

    await insertAgentRun({
      rumbleUserIdHex: agentDoc.rumbleUserIdHex,
      agentId: agent.id,
      arenaPoolId,
      decision: runDecision,
      summary: exec.summary,
      detail: exec.ok
        ? {
            txHash: exec.txHash,
            arenaMult,
            arenaPayoutEth,
            decisionSource,
            simPnlEth: exec.pnlEth,
            simGasEth: exec.gasEth,
            spotUsd,
            ...(synthesized ? { synthesized: true } : {}),
            ...(liveSpot?.stale ? { spotStale: true } : {}),
            ...(exec.narrative ? { narrative: exec.narrative } : {}),
          }
        : {
            error: exec.error,
            arenaMult,
            arenaPayoutEth: 0,
            decisionSource,
            spotUsd,
          },
      txHash: exec.ok ? exec.txHash : undefined,
      chainId,
      idempotencyKey,
    })

    outcomes.push({
      arenaPoolId,
      decision: actDecision.type,
      ok: exec.ok,
      summary: exec.summary,
      txHash: exec.ok ? exec.txHash : undefined,
      pnlEth: exec.pnlEth,
      synthesized,
    })
  }

  /** User-deployed lab pools — registered via the Liquidity Lab, opted-in per agent. */
  const enabledLabIds = agent.config.enabledLabPoolIds
  if (enabledLabIds.length > 0) {
    const allLab = await listLabPoolsForUser(agentDoc.rumbleUserIdHex)
    const byId = new Map(allLab.map(p => [p.labPoolId, p] as const))
    for (const labPoolId of enabledLabIds) {
      const doc = byId.get(labPoolId)
      if (!doc || doc.chainId !== chainId) {
        outcomes.push({ labPoolId, skipped: true, reason: "lab_pool_missing_or_wrong_chain" })
        continue
      }
      const labPool: LabPoolDef = {
        labPoolId: doc.labPoolId,
        chainSlug: doc.chainSlug,
        chainId: doc.chainId,
        protocol: "V4",
        fee: doc.fee,
        tickSpacing: doc.tickSpacing,
        hooks: doc.hooks,
        token0: doc.token0,
        token1: doc.token1,
        v4PoolId: doc.v4PoolId,
        label: doc.label,
      }

      const evalOut = await evaluateLabPoolRuntimeDecision({
        labPool,
        boxes: agent.boxes,
        config: agent.config,
      })

      let decision: RuntimeDecision = evalOut.decision
      let synthesized = false

      if (decision.type === "skip" && isSoftSkipReason(decision.reason)) {
        // Lab swap direction: prefer arena-style picker (approved tokens),
        // falling back to native side or token0_to_token1.
        const direction = (() => {
          const approved = new Set(
            agent.config.approvedTokens
              .split(",")
              .map(x => x.trim().toUpperCase())
              .filter(Boolean),
          )
          if (approved.has(labPool.token0.symbol.toUpperCase())) return "token0_to_token1" as const
          if (approved.has(labPool.token1.symbol.toUpperCase())) return "token1_to_token0" as const
          if (labPool.token1.isNative) return "token0_to_token1" as const
          if (labPool.token0.isNative) return "token1_to_token0" as const
          return "token0_to_token1" as const
        })()

        const synth = synthesizeFallbackLabSwap({
          labPool,
          config: agent.config,
          boxes: agent.boxes,
          direction,
        })
        if (synth) {
          decision = synth
          synthesized = true
        }
      }

      const idempotencyKey = `tick-${agent.id}-lab-${labPoolId}-${tickBucket()}`

      if (decision.type === "skip") {
        await insertAgentRun({
          rumbleUserIdHex: agentDoc.rumbleUserIdHex,
          agentId: agent.id,
          labPoolId,
          decision: "skip",
          summary: decision.reason,
          detail: { labPoolLabel: labPool.label, displayUsd: evalOut.displayUsd },
          idempotencyKey,
        })
        outcomes.push({ labPoolId, decision: "skip", reason: decision.reason })
        continue
      }
      let actDecision: ActionDecision = decision

      const ctx: ExecuteAgentContext = {
        rumbleUserIdHex: agentDoc.rumbleUserIdHex,
        email: user.email,
        agentId: agent.id,
        walletAddress,
        chainId,
        config: agent.config,
        idempotencyKey,
      }

      const liveWallet = (await ensureUserSimWallet({
        rumbleUserIdHex: agentDoc.rumbleUserIdHex,
        navbarAddress: user.privyEmbeddedWalletAddress,
        chainId,
      })) ?? simWallet

      const labSpotUsd = Number.parseFloat(String(evalOut.displayUsd ?? "0")) || 0

      let exec = await simulateAgentDecision({
        decision: actDecision,
        ctx,
        spotUsd: labSpotUsd,
        simWallet: liveWallet,
      })

      const isSoftSimMiss =
        !exec.ok &&
        (exec.summary === "sim_zero_eth_balance" ||
          exec.summary === "sim_zero_usdc_balance" ||
          exec.summary === "sim_no_lp_position" ||
          exec.summary === "zero_notional")

      if (isSoftSimMiss && !synthesized) {
        const synth = synthesizeFallbackLabSwap({
          labPool,
          config: agent.config,
          boxes: agent.boxes,
          direction: "token0_to_token1",
          scoutFraction: 0.06,
        })
        if (synth) {
          const retryWallet = (await ensureUserSimWallet({
            rumbleUserIdHex: agentDoc.rumbleUserIdHex,
            navbarAddress: user.privyEmbeddedWalletAddress,
            chainId,
          })) ?? liveWallet
          exec = await simulateAgentDecision({
            decision: synth,
            ctx,
            spotUsd: labSpotUsd,
            simWallet: retryWallet,
          })
          actDecision = synth
          synthesized = true
        }
      }

      const stillSoftMiss =
        !exec.ok &&
        (exec.summary === "sim_zero_eth_balance" ||
          exec.summary === "sim_zero_usdc_balance" ||
          exec.summary === "sim_no_lp_position" ||
          exec.summary === "zero_notional")

      const runDecision: "swap" | "lp_increase" | "lp_decrease" | "skip" | "error" = stillSoftMiss
        ? "skip"
        : !exec.ok
          ? "error"
          : actDecision.type === "swap"
            ? "swap"
            : actDecision.type === "lp_increase"
              ? "lp_increase"
              : actDecision.type === "lp_decrease"
                ? "lp_decrease"
                : "error"

      const arenaMult = exec.ok && typeof exec.outcomeMultiplier === "number" ? exec.outcomeMultiplier : 1
      const arenaPayoutEth = exec.ok ? Math.max(0, betEth * arenaMult) : 0

      await insertAgentRun({
        rumbleUserIdHex: agentDoc.rumbleUserIdHex,
        agentId: agent.id,
        labPoolId,
        decision: runDecision,
        summary: exec.summary,
        detail: exec.ok
          ? {
              txHash: exec.txHash,
              labPoolLabel: labPool.label,
              displayUsd: evalOut.displayUsd,
              arenaMult,
              arenaPayoutEth,
              simPnlEth: exec.pnlEth,
              simGasEth: exec.gasEth,
              ...(synthesized ? { synthesized: true } : {}),
              ...(exec.narrative ? { narrative: exec.narrative } : {}),
            }
          : {
              error: exec.error,
              labPoolLabel: labPool.label,
              displayUsd: evalOut.displayUsd,
              arenaMult,
              arenaPayoutEth: 0,
            },
        txHash: exec.ok ? exec.txHash : undefined,
        chainId,
        idempotencyKey,
      })

      outcomes.push({
        labPoolId,
        decision: actDecision.type,
        ok: exec.ok,
        summary: exec.summary,
        txHash: exec.ok ? exec.txHash : undefined,
        pnlEth: exec.pnlEth,
        synthesized,
      })
    }
  }

  void refreshAgentMetricsRollupsForAgent({
    rumbleUserIdHex: agentDoc.rumbleUserIdHex,
    agentId: agent.id,
  }).catch(() => {})

  /**
   * Rebuild the arena leaderboard caches for the pools this agent traded so
   * the leaderboard surfaces sim activity within seconds. Fire-and-forget —
   * it has to wait on the metrics rollup, but we don't block the tick on it.
   */
  const arenaPoolIds = pools.map(p => p.id as ArenaPoolId)
  if (arenaPoolIds.length > 0) {
    void refreshArenaLeaderboardsForAgent({
      arenaPoolIds,
      chainId,
    }).catch(() => {})
  }

  return { outcomes }
}
