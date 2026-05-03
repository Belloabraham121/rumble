import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import {
  appendHighlightAgentIfNeeded,
  getOrRebuildArenaLeaderboard,
  leaderboardRangeToMetricsRange,
  type LeaderboardApiRange,
} from "@/lib/arena/leaderboard"
import type { ArenaLeaderboardPublicEntry } from "@/lib/arena/types"
import { getRomboServerEnv } from "@/lib/rombo/server-env"
import { slugFromChainId, type RomboChainSlug } from "@/lib/rombo/chain-config"

export const dynamic = "force-dynamic"

function parseArenaPoolId(raw: string | null): ArenaPoolId | null {
  if (!raw) return null
  return (ARENA_POOL_IDS as readonly string[]).includes(raw) ? (raw as ArenaPoolId) : null
}

function parseRange(raw: string | null): LeaderboardApiRange {
  if (raw === "7d" || raw === "all") return raw
  return "30d"
}

export async function GET(req: Request) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  let arenaPoolId: ArenaPoolId | null = null
  let chainId = env.defaultChainId
  let range: LeaderboardApiRange = "30d"
  let limit = 20
  let highlightAgentId: string | undefined
  let force: boolean | undefined

  try {
    const u = new URL(req.url)
    arenaPoolId = parseArenaPoolId(u.searchParams.get("arenaPoolId"))
    const cid = u.searchParams.get("chainId")
    if (cid) {
      const n = Number.parseInt(cid, 10)
      if (Number.isFinite(n)) chainId = n
    }
    range = parseRange(u.searchParams.get("range"))
    const l = Number.parseInt(u.searchParams.get("limit") ?? "20", 10)
    if (Number.isFinite(l)) limit = Math.min(Math.max(l, 1), 100)
    const h = u.searchParams.get("highlightAgentId")?.trim()
    if (h) highlightAgentId = h
    force = u.searchParams.get("force") === "1"
  } catch {
    // ignore
  }

  if (!arenaPoolId) {
    return NextResponse.json({ error: "Missing or invalid arenaPoolId." }, { status: 400 })
  }

  const slug = slugFromChainId(chainId)
  if (!slug) {
    return NextResponse.json({ error: "Unsupported chainId." }, { status: 400 })
  }

  const metricsRange = leaderboardRangeToMetricsRange(range)
  const { entries } = await getOrRebuildArenaLeaderboard({
    arenaPoolId,
    chainId,
    chainSlug: slug as RomboChainSlug,
    metricsRange,
    force,
  })

  const withHighlight = await appendHighlightAgentIfNeeded({
    entries,
    highlightAgentId,
    metricsRange,
    arenaPoolId,
    chainSlug: slug as RomboChainSlug,
  })

  const sorted = [...withHighlight].sort((a, b) => b.score - a.score)
  const sliced = sorted.slice(0, limit)

  const publicEntries: ArenaLeaderboardPublicEntry[] = sliced.map(e => ({
    rank: e.rank,
    agentId: e.agentId,
    displayName: e.displayName,
    poolLabel: e.poolLabel,
    pnlNetUsd: e.pnlNetUsd,
    winRate: e.winRate,
    actions: e.actions,
    score: e.score,
  }))

  return NextResponse.json({
    arenaPoolId,
    chainId,
    range,
    entries: publicEntries,
    updatedAt: new Date().toISOString(),
  })
}
