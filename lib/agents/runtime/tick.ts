import "server-only"

import { agentDocToAgent } from "@/lib/db/agents.repo"
import type { AgentDoc } from "@/lib/db/agents.repo"
import { refreshAgentMetricsRollupsForAgent } from "@/lib/agents/metrics"
import { insertAgentRun } from "@/lib/db/agent-runs.repo"
import { findAgentWallet } from "@/lib/db/agent-wallets.repo"
import { getUserByRomboUserIdHex } from "@/lib/db/users.repo"
import { ensureAgentPrivyWallet } from "@/lib/integrations/privy/agent-wallet"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { isPoolPriceFresh, refreshPoolPrice } from "@/lib/data/live-pool-tick"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getTradableArenaPools } from "@/lib/agents/arena-pools"
import { evaluateRuntimeDecision } from "@/lib/agents/runtime/llm-evaluate"
import { executeAgentDecision, type ExecuteAgentContext } from "@/lib/agents/runtime/execute-decision"
import { chartCoordFromUsd } from "@/lib/agents/runtime/chart-coord"
import type { RuntimeDecision } from "@/lib/agents/runtime/evaluate-boxes"
import {
  arenaSubgraphSnapshotFromStrings,
  computeArenaMultiplierFromChartBand,
  subgraphActivityBoost,
  type ArenaPoolSubgraphSnapshot,
} from "@/lib/agents/arena-box-multiplier"
import { chainIdFromSlug } from "@/lib/rombo/chain-config"
import { getRomboServerEnv } from "@/lib/rombo/server-env"
import type { Agent } from "@/lib/agents/agent-types"

/** Fallback arena mult when no box band is available (deterministic from idempotency key). */
function arenaBetShape(idempotencyKey: string, betAmountStr: string): { mult: number; payoutEth: number } {
  let h = 0
  for (let i = 0; i < idempotencyKey.length; i++) {
    h = (h * 31 + idempotencyKey.charCodeAt(i)) >>> 0
  }
  const mult = Math.round((1.35 + ((h % 1000) / 1000) * 2.65) * 100) / 100
  const betEth = Number.parseFloat(betAmountStr)
  const bet = Number.isFinite(betEth) && betEth > 0 ? betEth : 0
  const payoutEth = Math.round(bet * mult * 10000) / 10000
  return { mult, payoutEth }
}

function payoutFromMult(mult: number, betAmountStr: string): { mult: number; payoutEth: number } {
  const betEth = Number.parseFloat(betAmountStr)
  const bet = Number.isFinite(betEth) && betEth > 0 ? betEth : 0
  return { mult, payoutEth: Math.round(bet * mult * 10000) / 10000 }
}

/** Arena economics tied to box band vs spot + fee tier + optional subgraph 24h activity. */
function resolveArenaEconomics(
  agent: Agent,
  decision: RuntimeDecision,
  spotUsd: number,
  arenaPoolId: ArenaPoolId,
  idempotencyKey: string,
  betAmountStr: string,
  subgraph: ArenaPoolSubgraphSnapshot | null,
): { mult: number; payoutEth: number; subgraphActivityBoost?: number } {
  const spotCoord = chartCoordFromUsd(spotUsd, arenaPoolId)

  if (decision.type === "swap") {
    const box = agent.boxes.find(b => b.id === decision.boxId)
    if (box) {
      const mult = computeArenaMultiplierFromChartBand({
        chartLow: box.low,
        chartHigh: box.high,
        spotChartCoord: spotCoord,
        arenaPoolId,
        subgraph,
      })
      const b = subgraphActivityBoost(subgraph)
      return {
        ...payoutFromMult(mult, betAmountStr),
        ...(b !== 1 ? { subgraphActivityBoost: Math.round(b * 10000) / 10000 } : {}),
      }
    }
  }

  if (decision.type === "lp_increase" || decision.type === "lp_decrease") {
    const mult = computeArenaMultiplierFromChartBand({
      chartLow: decision.chartLow,
      chartHigh: decision.chartHigh,
      spotChartCoord: spotCoord,
      arenaPoolId,
      subgraph,
    })
    const b = subgraphActivityBoost(subgraph)
    return {
      ...payoutFromMult(mult, betAmountStr),
      ...(b !== 1 ? { subgraphActivityBoost: Math.round(b * 10000) / 10000 } : {}),
    }
  }

  return arenaBetShape(idempotencyKey, betAmountStr)
}

/** Loads cached pool metrics (volume/fees/TVL) for multiplier blend; may refresh when stale. */
async function resolveArenaSubgraphSnapshot(
  arenaPoolId: ArenaPoolId,
  chainId: number,
): Promise<ArenaPoolSubgraphSnapshot | null> {
  const env = getRomboServerEnv()
  const doc = await getPoolPrice({ chainId, arenaPoolId })
  const stringsFromDoc = () =>
    doc
      ? {
          volumeUsd24h: doc.volumeUsd24h,
          feesUsd24h: doc.feesUsd24h,
          totalValueLockedUsd: doc.totalValueLockedUsd,
          tick: doc.tick,
        }
      : undefined

  const hasActivityStrings = (s: {
    volumeUsd24h?: string
    feesUsd24h?: string
  }) =>
    (!!s.volumeUsd24h && Number.parseFloat(s.volumeUsd24h) > 0) ||
    (!!s.feesUsd24h && Number.parseFloat(s.feesUsd24h) > 0)

  let strings = stringsFromDoc()
  if (!strings || !hasActivityStrings(strings)) {
    if (env.hasSubgraph || env.chainlinkSpotEnabled) {
      const refreshed = await refreshPoolPrice(arenaPoolId, chainId)
      if (refreshed.ok) {
        if (env.hasMongo) {
          const again = await getPoolPrice({ chainId, arenaPoolId })
          strings = again
            ? {
                volumeUsd24h: again.volumeUsd24h,
                feesUsd24h: again.feesUsd24h,
                totalValueLockedUsd: again.totalValueLockedUsd,
                tick: again.tick,
              }
            : {
                volumeUsd24h: refreshed.snapshot.volumeUsd24h,
                feesUsd24h: refreshed.snapshot.feesUsd24h,
                totalValueLockedUsd: refreshed.snapshot.totalValueLockedUsd,
                tick: refreshed.snapshot.tick,
              }
        } else {
          strings = {
            volumeUsd24h: refreshed.snapshot.volumeUsd24h,
            feesUsd24h: refreshed.snapshot.feesUsd24h,
            totalValueLockedUsd: refreshed.snapshot.totalValueLockedUsd,
            tick: refreshed.snapshot.tick,
          }
        }
      }
    }
  }

  return arenaSubgraphSnapshotFromStrings(strings)
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

function tickBucket(ms = Date.now(), windowMs = 60_000): string {
  return String(Math.floor(ms / windowMs))
}

/**
 * One server-side evaluation pass for a persisted agent row.
 * Iterates enabled arena pools, evaluates price boxes, optionally executes swaps.
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

  const user = await getUserByRomboUserIdHex(agentDoc.romboUserIdHex)
  if (!user?.privyUserId) {
    outcomes.push({ skipped: true, reason: "no_privy_user" })
    await insertAgentRun({
      romboUserIdHex: agentDoc.romboUserIdHex,
      agentId: agent.id,
      decision: "skip",
      summary: "no_privy_user",
    })
    return { outcomes }
  }

  const wallet =
    (await ensureAgentPrivyWallet({
      romboUserIdHex: agentDoc.romboUserIdHex,
      privyUserId: user.privyUserId,
      agentId: agent.id,
    })) ?? null

  const addrRecord = await findAgentWallet(agentDoc.romboUserIdHex, agent.id)
  const walletAddress = wallet?.address ?? addrRecord?.address
  const walletId = wallet?.id ?? addrRecord?.privyWalletId

  if (!walletId || !walletAddress) {
    outcomes.push({ skipped: true, reason: "no_agent_wallet" })
    await insertAgentRun({
      romboUserIdHex: agentDoc.romboUserIdHex,
      agentId: agent.id,
      decision: "skip",
      summary: "no_agent_wallet",
    })
    return { outcomes }
  }

  const pools = getTradableArenaPools(agent.config.tradeAllPools, agent.config.enabledPoolIds)

  for (const pool of pools) {
    const arenaPoolId = pool.id as ArenaPoolId
    const spot = await resolveDisplayUsd(arenaPoolId, chainId)
    if (!spot) {
      await insertAgentRun({
        romboUserIdHex: agentDoc.romboUserIdHex,
        agentId: agent.id,
        arenaPoolId,
        decision: "skip",
        summary: "no_pool_price",
      })
      outcomes.push({ arenaPoolId, skipped: true, reason: "no_pool_price" })
      continue
    }

    const { decision, source: decisionSource } = await evaluateRuntimeDecision({
      displayUsd: spot.usd,
      arenaPoolId,
      boxes: agent.boxes,
      config: agent.config,
    })

    const idempotencyKey = `tick-${agent.id}-${arenaPoolId}-${tickBucket()}`

    if (decision.type === "skip") {
      await insertAgentRun({
        romboUserIdHex: agentDoc.romboUserIdHex,
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

    const ctx: ExecuteAgentContext = {
      romboUserIdHex: agentDoc.romboUserIdHex,
      email: user.email,
      agentId: agent.id,
      privyWalletId: walletId,
      walletAddress,
      chainId,
      config: agent.config,
      idempotencyKey,
    }

    const exec = await executeAgentDecision(decision, ctx)

    const subgraphSnap = await resolveArenaSubgraphSnapshot(arenaPoolId, chainId)

    const arena = resolveArenaEconomics(
      agent,
      decision,
      spot.usd,
      arenaPoolId,
      idempotencyKey,
      agent.config.betAmount,
      subgraphSnap,
    )

    const runDecision: "swap" | "lp_increase" | "lp_decrease" | "error" =
      !exec.ok ? "error" : decision.type === "swap" ? "swap" : decision.type === "lp_increase" ? "lp_increase" : decision.type === "lp_decrease" ? "lp_decrease" : "error"

    await insertAgentRun({
      romboUserIdHex: agentDoc.romboUserIdHex,
      agentId: agent.id,
      arenaPoolId,
      decision: runDecision,
      summary: exec.summary,
      detail: exec.ok
        ? {
            txHash: exec.txHash,
            arenaMult: arena.mult,
            arenaPayoutEth: arena.payoutEth,
            decisionSource,
            ...(arena.subgraphActivityBoost !== undefined
              ? { arenaSubgraphActivityBoost: arena.subgraphActivityBoost }
              : {}),
          }
        : {
            error: exec.error,
            arenaMult: arena.mult,
            arenaPayoutEth: 0,
            decisionSource,
            ...(arena.subgraphActivityBoost !== undefined
              ? { arenaSubgraphActivityBoost: arena.subgraphActivityBoost }
              : {}),
          },
      txHash: exec.ok ? exec.txHash : undefined,
      chainId,
      idempotencyKey,
    })

    outcomes.push({
      arenaPoolId,
      decision: decision.type,
      ok: exec.ok,
      summary: exec.summary,
      txHash: exec.ok ? exec.txHash : undefined,
    })
  }

  void refreshAgentMetricsRollupsForAgent({
    romboUserIdHex: agentDoc.romboUserIdHex,
    agentId: agent.id,
  }).catch(() => {})

  return { outcomes }
}
