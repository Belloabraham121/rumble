import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { ARENA_POOL_IDS } from "@/lib/agents/arena-pools"
import type { MetricsRange } from "@/lib/agents/metrics-types"
import { computeAgentMetrics } from "@/lib/agents/metrics"
import type { ArenaLeaderboardEntry } from "@/lib/arena/types"
import type { AgentDoc } from "@/lib/db/agents.repo"
import { findAgentByAgentId, listAgentsForArenaLeaderboard } from "@/lib/db/agents.repo"
import {
  findArenaLeaderboardCache,
  upsertArenaLeaderboardCache,
} from "@/lib/db/arena-leaderboard.repo"
import type { RumbleChainSlug } from "@/lib/rumble/chain-config"
import { slugFromChainId } from "@/lib/rumble/chain-config"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/** Normal cohort-relative score (Phase 5 integration plan). */
export function computeArenaScore(input: {
  /** Min–max normalised net PnL within leaderboard cohort (0–1). */
  pnlUsdNorm01: number
  /** 0–1 */
  winRate: number
  actions: number
}): number {
  return (
    0.6 * input.pnlUsdNorm01 * 100 +
    0.3 * input.winRate * 100 +
    0.1 * Math.log(1 + Math.max(0, input.actions))
  )
}

const MAX_ROWS_STORED = 250
const BATCH = 10

export type LeaderboardApiRange = "30d" | "7d" | "all"

export function leaderboardRangeToMetricsRange(r: LeaderboardApiRange): MetricsRange {
  if (r === "30d") return "30d"
  if (r === "7d") return "7d"
  return "all"
}

async function metricsForAgents(
  docs: AgentDoc[],
  metricsRange: MetricsRange,
): Promise<Array<{ doc: AgentDoc; metrics: Awaited<ReturnType<typeof computeAgentMetrics>> | null }>> {
  const out: Array<{ doc: AgentDoc; metrics: Awaited<ReturnType<typeof computeAgentMetrics>> | null }> = []

  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH)
    const batch = await Promise.all(
      slice.map(async doc => {
        try {
          const metrics = await computeAgentMetrics({
            agentId: doc.agentId,
            rumbleUserIdHex: doc.rumbleUserIdHex,
            range: metricsRange,
          })
          return { doc, metrics }
        } catch {
          return { doc, metrics: null }
        }
      }),
    )
    out.push(...batch)
  }

  return out
}

function buildEntriesFromRows(
  rows: Array<{ doc: AgentDoc; metrics: Awaited<ReturnType<typeof computeAgentMetrics>> | null }>,
): ArenaLeaderboardEntry[] {
  const ok = rows.filter(r => r.metrics !== null) as Array<{
    doc: AgentDoc
    metrics: NonNullable<Awaited<ReturnType<typeof computeAgentMetrics>>>
  }>

  const pnls = ok.map(r => r.metrics.netPnlUsd)
  const min = pnls.length ? Math.min(...pnls) : 0
  const max = pnls.length ? Math.max(...pnls) : 0
  const span = max - min || 1

  const scored = ok.map(r => {
    const pnlNorm = (r.metrics.netPnlUsd - min) / span
    const score = computeArenaScore({
      pnlUsdNorm01: pnlNorm,
      winRate: r.metrics.winRate,
      actions: r.metrics.actions,
    })
    const poolLabel = r.doc.config.pool ?? r.doc.config.basePair ?? "—"
    return {
      agentId: r.doc.agentId,
      rumbleUserIdHex: r.doc.rumbleUserIdHex,
      displayName: r.doc.config.name,
      poolLabel,
      pnlNetUsd: r.metrics.netPnlUsd,
      winRate: r.metrics.winRate,
      actions: r.metrics.actions,
      score,
      _sort: score,
    }
  })

  scored.sort((a, b) => b._sort - a._sort)

  return scored.slice(0, MAX_ROWS_STORED).map((row, i) => ({
    rank: i + 1,
    agentId: row.agentId,
    rumbleUserIdHex: row.rumbleUserIdHex,
    displayName: row.displayName,
    poolLabel: row.poolLabel,
    pnlNetUsd: row.pnlNetUsd,
    winRate: row.winRate,
    actions: row.actions,
    score: row.score,
  }))
}

export async function rebuildArenaLeaderboardCache(input: {
  arenaPoolId: ArenaPoolId
  chainId: number
  chainSlug: RumbleChainSlug
  metricsRange: MetricsRange
}): Promise<ArenaLeaderboardEntry[]> {
  const docs = await listAgentsForArenaLeaderboard({
    chainSlug: input.chainSlug,
    arenaPoolId: input.arenaPoolId,
  })

  const rows = await metricsForAgents(docs, input.metricsRange)
  const entries = buildEntriesFromRows(rows)

  await upsertArenaLeaderboardCache({
    arenaPoolId: input.arenaPoolId,
    chainId: input.chainId,
    rangeKey: input.metricsRange,
    entries,
  })

  return entries
}

/**
 * Rebuild leaderboard caches for the arena pools an individual agent trades.
 * Called fire-and-forget at the end of each agent tick so the leaderboard
 * reflects this agent's just-recorded activity within seconds rather than
 * waiting on the daily cron or the on-read stale window.
 *
 * Errors are swallowed — leaderboards are non-critical to tick correctness.
 */
export async function refreshArenaLeaderboardsForAgent(input: {
  arenaPoolIds: readonly ArenaPoolId[]
  chainId: number
  /** Default to the dashboard's "30d" range — matches the cron + UI default. */
  metricsRange?: MetricsRange
}): Promise<void> {
  const slug = slugFromChainId(input.chainId)
  if (!slug) return

  const ids = input.arenaPoolIds.length > 0 ? input.arenaPoolIds : ARENA_POOL_IDS
  const range: MetricsRange = input.metricsRange ?? "30d"

  await Promise.all(
    ids.map(arenaPoolId =>
      rebuildArenaLeaderboardCache({
        arenaPoolId,
        chainId: input.chainId,
        chainSlug: slug,
        metricsRange: range,
      }).catch(() => {}),
    ),
  )
}

/** Rebuild leaderboard caches for every arena pool on the default deployment chain. */
export async function rebuildAllArenaLeaderboards(input: {
  metricsRange: MetricsRange
}): Promise<{ arenaPoolId: ArenaPoolId; chainId: number; rows: number }[]> {
  const env = getRumbleServerEnv()
  const chainId = env.defaultChainId
  const slug = slugFromChainId(chainId)
  if (!slug) {
    return []
  }

  const results: { arenaPoolId: ArenaPoolId; chainId: number; rows: number }[] = []
  for (const arenaPoolId of ARENA_POOL_IDS) {
    const entries = await rebuildArenaLeaderboardCache({
      arenaPoolId,
      chainId,
      chainSlug: slug,
      metricsRange: input.metricsRange,
    })
    results.push({ arenaPoolId, chainId, rows: entries.length })
  }
  return results
}

/**
 * Cache freshness window for `getOrRebuildArenaLeaderboard`. We keep this
 * short enough that — combined with the post-tick fire-and-forget rebuild
 * triggered by `refreshArenaLeaderboardsForAgent` — the leaderboard reflects
 * agent activity within ~30 s of the tick that produced it.
 */
const CACHE_STALE_MS = 30 * 1000

export async function getOrRebuildArenaLeaderboard(input: {
  arenaPoolId: ArenaPoolId
  chainId: number
  chainSlug: RumbleChainSlug
  metricsRange: MetricsRange
  force?: boolean
}): Promise<{ entries: ArenaLeaderboardEntry[]; rebuilt: boolean }> {
  const rangeKey = input.metricsRange
  const cached = await findArenaLeaderboardCache({
    arenaPoolId: input.arenaPoolId,
    chainId: input.chainId,
    rangeKey,
  })

  const stale =
    !cached ||
    Date.now() - cached.updatedAt.getTime() > CACHE_STALE_MS ||
    cached.entries.length === 0

  if (!input.force && cached && !stale) {
    return { entries: cached.entries, rebuilt: false }
  }

  const entries = await rebuildArenaLeaderboardCache({
    arenaPoolId: input.arenaPoolId,
    chainId: input.chainId,
    chainSlug: input.chainSlug,
    metricsRange: input.metricsRange,
  })
  return { entries, rebuilt: true }
}

/** Append viewer row when they are not in the cached slice (still ranked globally in cache). */
export async function appendHighlightAgentIfNeeded(input: {
  entries: ArenaLeaderboardEntry[]
  highlightAgentId?: string
  metricsRange: MetricsRange
  arenaPoolId: ArenaPoolId
  chainSlug: RumbleChainSlug
}): Promise<ArenaLeaderboardEntry[]> {
  if (!input.highlightAgentId) return input.entries
  if (input.entries.some(e => e.agentId === input.highlightAgentId)) return input.entries

  const doc = await findAgentByAgentId(input.highlightAgentId)
  if (!doc) return input.entries

  const tradesPool =
    doc.config.tradeAllPools || doc.config.enabledPoolIds?.includes(input.arenaPoolId)
  if (!tradesPool || doc.config.chain !== input.chainSlug) return input.entries

  let metrics: Awaited<ReturnType<typeof computeAgentMetrics>>
  try {
    metrics = await computeAgentMetrics({
      agentId: doc.agentId,
      rumbleUserIdHex: doc.rumbleUserIdHex,
      range: input.metricsRange,
    })
  } catch {
    return input.entries
  }

  const pnls = [...input.entries.map(e => e.pnlNetUsd), metrics.netPnlUsd]
  const min = Math.min(...pnls)
  const max = Math.max(...pnls)
  const span = max - min || 1
  const pnlNorm = (metrics.netPnlUsd - min) / span
  const score = computeArenaScore({
    pnlUsdNorm01: pnlNorm,
    winRate: metrics.winRate,
    actions: metrics.actions,
  })

  const insertRank =
    input.entries.filter(
      e => e.score > score || (e.score === score && e.pnlNetUsd > metrics.netPnlUsd),
    ).length + 1

  const row: ArenaLeaderboardEntry = {
    rank: insertRank,
    agentId: doc.agentId,
    rumbleUserIdHex: doc.rumbleUserIdHex,
    displayName: doc.config.name,
    poolLabel: doc.config.pool ?? doc.config.basePair ?? "—",
    pnlNetUsd: metrics.netPnlUsd,
    winRate: metrics.winRate,
    actions: metrics.actions,
    score,
  }

  return [...input.entries, row]
}
