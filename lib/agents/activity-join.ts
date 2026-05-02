import "server-only"

import { ARENA_POOL_BY_ID, type ArenaPoolId } from "@/lib/agents/arena-pools"
import type { AgentActivityEvent, ExecutionKind } from "@/components/dashboard/activity-types"
import type { AgentRunDoc } from "@/lib/db/agent-runs.repo"
import {
  listAgentRunsAscendingPage,
  listAgentRunsForUserLedger,
} from "@/lib/db/agent-runs.repo"
import type { OnchainReceiptDoc } from "@/lib/db/onchain-receipts.repo"
import { findOnchainReceiptsForPairs } from "@/lib/db/onchain-receipts.repo"
import type { TradingAttemptDoc } from "@/lib/db/trading.repo"
import { listTradingAttemptsForAgentRecent } from "@/lib/db/trading.repo"
import { agentDocToAgent, findAgentForUser } from "@/lib/db/agents.repo"

function hexQuantityToBigInt(hex: string | undefined): bigint | undefined {
  if (!hex || typeof hex !== "string") return undefined
  const h = hex.startsWith("0x") ? hex : `0x${hex}`
  try {
    return BigInt(h)
  } catch {
    return undefined
  }
}

/** Effective gas price in gwei (legacy UI field name `gasGwei`). */
export function effectiveGasPriceGweiFromReceipt(r: OnchainReceiptDoc): number | undefined {
  const ep = r.effectiveGasPrice
  if (!ep) return undefined
  const wei = hexQuantityToBigInt(ep)
  if (wei === undefined) return undefined
  return Number(wei) / 1e9
}

function txShort(hash: string): string {
  const h = hash.trim().toLowerCase()
  if (h.length < 12 || !h.startsWith("0x")) return hash
  return `${h.slice(0, 8)}…${h.slice(-4)}`
}

function poolLabel(arenaPoolId?: string): string {
  if (!arenaPoolId) return ""
  const def = ARENA_POOL_BY_ID[arenaPoolId as ArenaPoolId]
  return def?.label ?? arenaPoolId
}

function kindFromRun(run: AgentRunDoc): ExecutionKind {
  switch (run.decision) {
    case "skip":
      return "box_skipped"
    case "swap":
      return "swap"
    case "error":
      return "error"
    case "lp_increase":
      return "add_liquidity"
    case "lp_decrease":
      return "remove_liquidity"
    default:
      return "box_skipped"
  }
}

function titleFromRun(run: AgentRunDoc): string {
  switch (run.decision) {
    case "skip":
      return "Runtime skip"
    case "swap":
      if (run.summary === "quote_signed_execute_disabled") return "Quote signed (dry run)"
      if (run.txHash) return "Swap executed"
      return "Swap attempted"
    case "error":
      return "Execution failed"
    case "lp_increase":
      return "Liquidity signal"
    case "lp_decrease":
      return "Liquidity trim signal"
    default:
      return "Agent tick"
  }
}

function detailFromRun(run: AgentRunDoc): string {
  const pool = poolLabel(run.arenaPoolId)
  const prefix = pool ? `${pool} · ` : ""
  switch (run.decision) {
    case "skip":
      return `${prefix}${humanSkipReason(run.summary)}`
    case "swap":
      return `${prefix}${run.summary.replace(/_/g, " ")}`
    case "error":
      return `${prefix}${run.detail && typeof run.detail.error === "string" ? run.detail.error : run.summary}`
    case "lp_increase":
    case "lp_decrease":
      return `${prefix}Automated LP not enabled — signal only.`
    default:
      return `${prefix}${run.summary}`
  }
}

function humanSkipReason(summary: string): string {
  switch (summary) {
    case "no_box_hit":
      return "Price outside configured bands."
    case "pool_not_enabled":
      return "Pool not enabled for this agent."
    case "token_not_approved":
      return "Token guardrail rejected route."
    case "zero_notional":
      return "Computed size rounded to zero."
    case "no_pool_price":
      return "No fresh pool price snapshot yet."
    case "no_agent_wallet":
      return "Agent wallet not provisioned."
    case "no_privy_user":
      return "Owner session missing Privy link."
    default:
      return summary.replace(/_/g, " ")
  }
}

function reasonFromRun(run: AgentRunDoc, attempt?: TradingAttemptDoc | null): string | undefined {
  if (attempt?.excerpt) return attempt.excerpt
  if (run.decision === "error" && run.detail?.error) {
    return typeof run.detail.error === "string" ? run.detail.error : undefined
  }
  return run.summary.replace(/_/g, " ")
}

/**
 * Map one persisted agent run (+ optional receipt / swap audit) to a dashboard event.
 */
export function agentRunToActivityEvent(
  run: AgentRunDoc,
  receipt?: OnchainReceiptDoc | null,
  swapAttempt?: TradingAttemptDoc | null,
): AgentActivityEvent {
  const kind = kindFromRun(run)
  const title = titleFromRun(run)
  const detail = detailFromRun(run)
  const at = run.createdAt.getTime()
  const hash = run.txHash?.trim().toLowerCase()
  const validHash = hash && /^0x[0-9a-f]{64}$/.test(hash) ? hash : undefined

  let gasGwei: number | undefined
  if (receipt) {
    gasGwei = effectiveGasPriceGweiFromReceipt(receipt)
  }

  return {
    id: `run-${run._id.toHexString()}`,
    at,
    kind,
    title,
    detail,
    reason: reasonFromRun(run, swapAttempt),
    pnlEth: undefined,
    gasGwei,
    txShort: validHash ? txShort(validHash) : undefined,
    txHash: validHash,
    chainId: run.chainId ?? receipt?.chainId,
    blockNumber: receipt?.blockNumber,
  }
}

function pickSwapAttempt(
  run: AgentRunDoc,
  attempts: TradingAttemptDoc[],
): TradingAttemptDoc | undefined {
  if (!run.idempotencyKey) return undefined
  const base = run.idempotencyKey.trim()
  return attempts.find(
    a =>
      a.kind === "swap" &&
      typeof a.idempotencyKey === "string" &&
      (a.idempotencyKey === base ||
        a.idempotencyKey.startsWith(`${base}:`) ||
        a.idempotencyKey.startsWith(base)),
  )
}

export async function loadAgentActivityEvents(input: {
  romboUserIdHex: string
  agentId: string
  limit?: number
  cursor?: string | null
}): Promise<{ events: AgentActivityEvent[]; nextCursor: string | null }> {
  const lim = Math.min(Math.max(input.limit ?? 60, 1), 120)
  const { runs, nextCursor } = await listAgentRunsAscendingPage({
    agentId: input.agentId,
    romboUserIdHex: input.romboUserIdHex,
    limit: lim,
    cursor: input.cursor ?? undefined,
  })

  const attempts = await listTradingAttemptsForAgentRecent(input.agentId, 200)

  const pairs: Array<{ chainId: number; txHash: string }> = []
  for (const r of runs) {
    if (r.chainId !== undefined && r.txHash) {
      pairs.push({ chainId: r.chainId, txHash: r.txHash })
    }
  }
  const receiptMap = await findOnchainReceiptsForPairs(pairs)

  const events: AgentActivityEvent[] = runs.map(run => {
    const h = run.txHash?.trim().toLowerCase()
    const key =
      run.chainId !== undefined && h && /^0x[0-9a-f]{64}$/.test(h)
        ? `${run.chainId}:${h}`
        : null
    const receipt = key ? receiptMap.get(key) : undefined
    const attempt = pickSwapAttempt(run, attempts)
    return agentRunToActivityEvent(run, receipt, attempt)
  })

  return { events, nextCursor }
}

export type LedgerActivityRow = AgentActivityEvent & {
  agentId: string
  agentName: string
  source: "ledger"
}

/**
 * Merged execution rows for `/dashboard/transactions` (newest first).
 */
export async function buildLedgerActivityRowsForUser(input: {
  romboUserIdHex: string
  agentId?: string
  limit?: number
}): Promise<LedgerActivityRow[]> {
  const lim = Math.min(Math.max(input.limit ?? 150, 1), 250)
  const runs = await listAgentRunsForUserLedger({
    romboUserIdHex: input.romboUserIdHex,
    agentId: input.agentId,
    limit: lim,
  })

  if (runs.length === 0) return []

  const agentIds = [...new Set(runs.map(r => r.agentId))]
  const nameById: Record<string, string> = {}
  for (const id of agentIds) {
    const doc = await findAgentForUser(input.romboUserIdHex, id)
    if (doc) nameById[id] = agentDocToAgent(doc).config.name
    else nameById[id] = id
  }

  const attemptsByAgent = new Map<string, TradingAttemptDoc[]>()
  for (const id of agentIds) {
    attemptsByAgent.set(id, await listTradingAttemptsForAgentRecent(id, 300))
  }

  const pairs: Array<{ chainId: number; txHash: string }> = []
  for (const r of runs) {
    if (r.chainId !== undefined && r.txHash) {
      pairs.push({ chainId: r.chainId, txHash: r.txHash })
    }
  }
  const receiptMap = await findOnchainReceiptsForPairs(pairs)

  const rows: LedgerActivityRow[] = runs.map(run => {
    const h = run.txHash?.trim().toLowerCase()
    const key =
      run.chainId !== undefined && h && /^0x[0-9a-f]{64}$/.test(h)
        ? `${run.chainId}:${h}`
        : null
    const receipt = key ? receiptMap.get(key) : undefined
    const attempts = attemptsByAgent.get(run.agentId) ?? []
    const attempt = pickSwapAttempt(run, attempts)
    const ev = agentRunToActivityEvent(run, receipt, attempt)
    return {
      ...ev,
      agentId: run.agentId,
      agentName: nameById[run.agentId] ?? run.agentId,
      source: "ledger",
    }
  })

  rows.sort((a, b) => b.at - a.at)
  return rows
}
