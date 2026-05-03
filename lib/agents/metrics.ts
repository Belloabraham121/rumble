import "server-only"

/**
 * Phase 4 metric definitions (dashboard integration plan):
 * - **Actions** — execution-kind `trading_attempts` with `status=ok` (swap / execute / order / LP ops).
 * - **Fills** — distinct txs whose receipt `status=success`.
 * - **Skips** — `agent_runs` decision `skip` OR attempt `error` OR receipt `reverted`.
 * - **Gas** — Σ (`gasUsed × effectiveGasPrice`) wei over receipts tied to OK attempts in range → ETH/USD.
 * - **PnL v1** — Σ (`amountOut×priceOut − amountIn×priceIn`) from persisted `swapQuote` + `getRefPriceAtTime`; **net = swapPnlUsd − gasUsd**.
 * - **Win rate** — `fills / (fills + skips)`.
 *
 * Rollups in `agent_metrics` are refreshed after each agent tick so reads stay O(1) while TTL-fresh.
 */

import type { MetricsRange, AgentMetricsSnapshot } from "@/lib/agents/metrics-types"
import { countAgentRunSkipsInRange } from "@/lib/db/agent-runs.repo"
import {
  findAgentMetricsRollup,
  upsertAgentMetricsRange,
  upsertAgentMetricsRollupFull,
} from "@/lib/db/agent-metrics.repo"
import { findAgentForUser, listAgentsForUser } from "@/lib/db/agents.repo"
import {
  findOnchainReceiptsForPairs,
  normalizeTxHash,
  type OnchainReceiptDoc,
} from "@/lib/db/onchain-receipts.repo"
import {
  listTradingAttemptsForAgentInRange,
  type TradingAttemptDoc,
  type TradingAttemptKind,
} from "@/lib/db/trading.repo"
import type { DashboardOverviewMetrics } from "@/lib/dashboard/overview-metrics"
import { getEthUsdSpot, getRefPriceAtTime } from "@/lib/onchain/pricing-at"
import { computeSwapLegPnlUsdV1 } from "@/lib/agents/swap-pnl-v1"
import type { PriceSymbol } from "@/lib/trading/token-meta"

const METRICS_ACTION_KINDS = new Set<TradingAttemptKind>([
  "swap",
  "execute",
  "order",
  "lp_create",
  "lp_increase",
  "lp_decrease",
  "lp_claim",
  "lp_migrate",
  "lp_claim_rewards",
])

const SWAP_PNL_KINDS = new Set<TradingAttemptKind>(["swap", "execute", "order"])

async function sumSwapPnlUsdFromAttempts(input: {
  attempts: TradingAttemptDoc[]
  receiptMap: Map<string, OnchainReceiptDoc>
}): Promise<number> {
  const priceHour = new Map<string, number>()
  const priceFor = async (sym: PriceSymbol, ts: number) => {
    const key = `${sym}:${Math.floor(ts / 3_600_000)}`
    if (!priceHour.has(key)) {
      priceHour.set(key, await getRefPriceAtTime({ symbol: sym, timestampMs: ts }))
    }
    return priceHour.get(key)!
  }

  let total = 0
  const seenTx = new Set<string>()

  for (const a of input.attempts) {
    if (!SWAP_PNL_KINDS.has(a.kind) || a.status !== "ok") continue
    if (!a.swapQuote || !a.txHash?.trim() || a.chainId === undefined || a.chainId === null) continue

    let normTx: string
    try {
      normTx = normalizeTxHash(a.txHash)
    } catch {
      continue
    }
    const key = `${a.chainId}:${normTx}`
    if (seenTx.has(key)) continue

    const r = input.receiptMap.get(key)
    if (!r || r.status !== "success") continue

    seenTx.add(key)
    const sq = a.swapQuote
    const ts = sq.evaluatedAtMs
    const [pIn, pOut] = await Promise.all([priceFor(sq.symbolIn, ts), priceFor(sq.symbolOut, ts)])
    total += computeSwapLegPnlUsdV1({
      amountInRaw: sq.amountInRaw,
      amountOutRaw: sq.amountOutRaw,
      tokenInDecimals: sq.tokenInDecimals,
      tokenOutDecimals: sq.tokenOutDecimals,
      priceInUsd: pIn,
      priceOutUsd: pOut,
    })
  }

  return total
}

function isMetricsActionKind(kind: TradingAttemptKind): boolean {
  return METRICS_ACTION_KINDS.has(kind)
}

export function parseMetricsRange(raw: string | null): MetricsRange {
  if (raw === "24h" || raw === "7d" || raw === "30d" || raw === "all") return raw
  return "all"
}

function rangeStartDate(range: MetricsRange): Date | null {
  const now = Date.now()
  if (range === "24h") return new Date(now - 24 * 60 * 60 * 1000)
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000)
  if (range === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000)
  return null
}

function receiptGasWei(r: OnchainReceiptDoc): bigint {
  const z = BigInt(0)
  const gu = r.gasUsed?.trim() ? BigInt(r.gasUsed) : z
  const ep = r.effectiveGasPrice?.trim() ? BigInt(r.effectiveGasPrice) : z
  return gu * ep
}

function weiToEthNumber(wei: bigint): number {
  return Number(wei) / 1e18
}

/** Serve cached rollup when newer than this (tick refresh keeps rows warm). */
const METRICS_ROLLUP_SERVE_MS = 5 * 60 * 1000

async function resolveAgentMetricsSnapshot(input: {
  romboUserIdHex: string
  agentId: string
  range: MetricsRange
}): Promise<AgentMetricsSnapshot> {
  const rollup = await findAgentMetricsRollup(input.romboUserIdHex, input.agentId)
  const cached = rollup?.byRange[input.range]
  const fresh =
    rollup &&
    cached !== undefined &&
    Date.now() - rollup.updatedAt.getTime() < METRICS_ROLLUP_SERVE_MS

  if (fresh && cached) return cached

  const computed = await computeAgentMetrics(input)
  await upsertAgentMetricsRange(input.romboUserIdHex, input.agentId, input.range, computed)
  return computed
}

/**
 * Authoritative Phase 4 metrics for one agent — computed from `trading_attempts`,
 * `agent_runs`, and `onchain_receipts`.
 */
export async function computeAgentMetrics(input: {
  agentId: string
  romboUserIdHex: string
  range: MetricsRange
}): Promise<AgentMetricsSnapshot> {
  const since = rangeStartDate(input.range)
  const [attempts, evaluatorSkips, ethUsd] = await Promise.all([
    listTradingAttemptsForAgentInRange({
      agentId: input.agentId,
      romboUserIdHex: input.romboUserIdHex,
      since,
    }),
    countAgentRunSkipsInRange({
      agentId: input.agentId,
      romboUserIdHex: input.romboUserIdHex,
      since,
    }),
    getEthUsdSpot(),
  ])

  let actions = 0
  let tradingSkips = 0
  const pairs: Array<{ chainId: number; txHash: string }> = []

  for (const a of attempts) {
    if (!isMetricsActionKind(a.kind)) continue
    if (a.status === "ok") {
      actions += 1
      if (a.txHash?.trim() && a.chainId !== undefined && a.chainId !== null) {
        pairs.push({ chainId: a.chainId, txHash: a.txHash })
      }
    } else {
      tradingSkips += 1
    }
  }

  const receiptMap = await findOnchainReceiptsForPairs(pairs)

  let fills = 0
  let chainSkips = 0
  let gasWei = BigInt(0)

  const seenPair = new Set<string>()
  for (const a of attempts) {
    if (!isMetricsActionKind(a.kind) || a.status !== "ok") continue
    const rawTx = a.txHash?.trim()
    const cid = a.chainId
    if (!rawTx || cid === undefined || cid === null) continue
    let normTx: string
    try {
      normTx = normalizeTxHash(rawTx)
    } catch {
      continue
    }

    const key = `${cid}:${normTx}`
    if (seenPair.has(key)) continue
    seenPair.add(key)

    const r = receiptMap.get(`${cid}:${normTx}`)
    if (!r) continue

    gasWei += receiptGasWei(r)

    if (r.status === "success") fills += 1
    else if (r.status === "reverted") chainSkips += 1
  }

  const swapPnlUsd = await sumSwapPnlUsdFromAttempts({
    attempts,
    receiptMap,
  })

  const skips = evaluatorSkips + tradingSkips + chainSkips
  const denom = fills + skips
  const winRate = denom > 0 ? fills / denom : 0
  const gasEth = weiToEthNumber(gasWei)
  const gasUsd = gasEth * ethUsd
  const netPnlUsd = swapPnlUsd - gasUsd

  return {
    range: input.range,
    actions,
    fills,
    skips,
    winRate,
    gasEth,
    gasUsd,
    swapPnlUsd,
    netPnlUsd,
    ethUsd,
  }
}

/** Cache-aware read for HTTP — verifies ownership. */
export async function resolveAgentMetricsForApi(input: {
  romboUserIdHex: string
  agentId: string
  range: MetricsRange
}): Promise<AgentMetricsSnapshot | null> {
  const agent = await findAgentForUser(input.romboUserIdHex, input.agentId)
  if (!agent) return null
  return resolveAgentMetricsSnapshot(input)
}

/** Recompute all ranges and upsert `agent_metrics` — call after each finalized agent tick. */
export async function refreshAgentMetricsRollupsForAgent(input: {
  romboUserIdHex: string
  agentId: string
}): Promise<void> {
  const ranges: MetricsRange[] = ["24h", "7d", "30d", "all"]
  const snaps = await Promise.all(
    ranges.map(r =>
      computeAgentMetrics({
        romboUserIdHex: input.romboUserIdHex,
        agentId: input.agentId,
        range: r,
      }),
    ),
  )
  const byRange: Partial<Record<MetricsRange, AgentMetricsSnapshot>> = {}
  for (let i = 0; i < ranges.length; i++) {
    byRange[ranges[i]] = snaps[i]
  }
  await upsertAgentMetricsRollupFull({
    romboUserIdHex: input.romboUserIdHex,
    agentId: input.agentId,
    byRange,
  })
}

/** Portfolio aggregates backed by Mongo attempts/runs/receipts (not client `totals`). */
export async function computeDashboardOverviewFromDb(input: {
  romboUserIdHex: string
  range: MetricsRange
}): Promise<DashboardOverviewMetrics> {
  const docs = await listAgentsForUser(input.romboUserIdHex)
  const agentCount = docs.length
  const runningCount = docs.filter(d => d.status === "running").length

  if (docs.length === 0) {
    return {
      agentCount: 0,
      runningCount: 0,
      totalNetPnlUsd: 0,
      totalGasUsd: 0,
      totalActions: 0,
      totalFills: 0,
      totalSkips: 0,
      winRate: 0,
    }
  }

  const snapshots = await Promise.all(
    docs.map(d =>
      resolveAgentMetricsSnapshot({
        agentId: d.agentId,
        romboUserIdHex: input.romboUserIdHex,
        range: input.range,
      }),
    ),
  )

  let totalNetPnlUsd = 0
  let totalGasUsd = 0
  let totalActions = 0
  let totalFills = 0
  let totalSkips = 0

  for (const m of snapshots) {
    totalNetPnlUsd += m.netPnlUsd
    totalGasUsd += m.gasUsd
    totalActions += m.actions
    totalFills += m.fills
    totalSkips += m.skips
  }

  const wrDenom = totalFills + totalSkips
  const winRate = wrDenom > 0 ? totalFills / wrDenom : 0

  return {
    agentCount,
    runningCount,
    totalNetPnlUsd,
    totalGasUsd,
    totalActions,
    totalFills,
    totalSkips,
    winRate,
  }
}

/** Batch metrics for grid — ignores unknown agent ids. */
export async function computeAgentsMetricsBatch(input: {
  romboUserIdHex: string
  agentIds: string[]
  range: MetricsRange
}): Promise<Record<string, AgentMetricsSnapshot>> {
  const out: Record<string, AgentMetricsSnapshot> = {}
  const unique = [...new Set(input.agentIds)].slice(0, 48)

  await Promise.all(
    unique.map(async id => {
      const m = await resolveAgentMetricsForApi({
        romboUserIdHex: input.romboUserIdHex,
        agentId: id,
        range: input.range,
      })
      if (m) out[id] = m
    }),
  )

  return out
}
