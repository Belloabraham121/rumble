import "server-only"

import { agentDocToAgent } from "@/lib/db/agents.repo"
import type { AgentDoc } from "@/lib/db/agents.repo"
import { insertAgentRun } from "@/lib/db/agent-runs.repo"
import { findAgentWallet } from "@/lib/db/agent-wallets.repo"
import { getUserByRomboUserIdHex } from "@/lib/db/users.repo"
import { ensureAgentPrivyWallet } from "@/lib/integrations/privy/agent-wallet"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { refreshPoolPrice } from "@/lib/data/live-pool-tick"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getTradableArenaPools } from "@/lib/agents/arena-pools"
import { evaluatePriceBoxes } from "@/lib/agents/runtime/evaluate-boxes"
import { executeAgentDecision, type ExecuteAgentContext } from "@/lib/agents/runtime/execute-decision"
import { chainIdFromSlug } from "@/lib/rombo/chain-config"

async function resolveDisplayUsd(
  arenaPoolId: ArenaPoolId,
  chainId: number,
): Promise<{ usd: number; stale?: boolean } | null> {
  let doc = await getPoolPrice({ chainId, arenaPoolId })
  if (!doc?.displayUsd) {
    const refreshed = await refreshPoolPrice(arenaPoolId, chainId)
    if (!refreshed.ok) return null
    doc = await getPoolPrice({ chainId, arenaPoolId })
  }
  const raw = doc?.displayUsd
  const n = raw !== undefined ? Number.parseFloat(String(raw)) : NaN
  if (!Number.isFinite(n)) return null
  return { usd: n }
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

    const decision = evaluatePriceBoxes({
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
        idempotencyKey,
      })
      outcomes.push({ arenaPoolId, decision: "skip", reason: decision.reason })
      continue
    }

    if (decision.type === "lp_increase" || decision.type === "lp_decrease") {
      await insertAgentRun({
        romboUserIdHex: agentDoc.romboUserIdHex,
        agentId: agent.id,
        arenaPoolId,
        decision: decision.type === "lp_increase" ? "lp_increase" : "lp_decrease",
        summary: "lp_not_implemented",
        detail: { boxId: decision.boxId },
        idempotencyKey,
      })
      outcomes.push({ arenaPoolId, decision: decision.type })
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

    await insertAgentRun({
      romboUserIdHex: agentDoc.romboUserIdHex,
      agentId: agent.id,
      arenaPoolId,
      decision: exec.ok ? "swap" : "error",
      summary: exec.summary,
      detail: exec.ok ? { txHash: exec.txHash } : { error: exec.error },
      txHash: exec.ok ? exec.txHash : undefined,
      chainId,
      idempotencyKey,
    })

    outcomes.push({
      arenaPoolId,
      decision: "swap",
      ok: exec.ok,
      summary: exec.summary,
      txHash: exec.ok ? exec.txHash : undefined,
    })
  }

  return { outcomes }
}
