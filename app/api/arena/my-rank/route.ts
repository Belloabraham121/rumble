import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getOrRebuildArenaLeaderboard, leaderboardRangeToMetricsRange } from "@/lib/arena/leaderboard"
import type { LeaderboardApiRange } from "@/lib/arena/leaderboard"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import { slugFromChainId, type RumbleChainSlug } from "@/lib/rumble/chain-config"

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
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let agentId = ""
  let arenaPoolId: ArenaPoolId | null = null
  let chainId = env.defaultChainId
  let range: LeaderboardApiRange = "30d"

  try {
    const u = new URL(req.url)
    agentId = u.searchParams.get("agentId")?.trim() ?? ""
    arenaPoolId = parseArenaPoolId(u.searchParams.get("arenaPoolId"))
    const cid = u.searchParams.get("chainId")
    if (cid) {
      const n = Number.parseInt(cid, 10)
      if (Number.isFinite(n)) chainId = n
    }
    range = parseRange(u.searchParams.get("range"))
  } catch {
    // ignore
  }

  if (!agentId || !arenaPoolId) {
    return NextResponse.json({ error: "agentId and arenaPoolId are required." }, { status: 400 })
  }

  const agent = await findAgentForUser(identity.rumbleUserIdHex, agentId)
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const slug = slugFromChainId(chainId)
  if (!slug) {
    return NextResponse.json({ error: "Unsupported chainId." }, { status: 400 })
  }

  const metricsRange = leaderboardRangeToMetricsRange(range)
  const { entries } = await getOrRebuildArenaLeaderboard({
    arenaPoolId,
    chainId,
    chainSlug: slug as RumbleChainSlug,
    metricsRange,
    force: false,
  })

  const sorted = [...entries].sort((a, b) => b.score - a.score)
  const idx = sorted.findIndex(e => e.agentId === agentId)
  const rank = idx >= 0 ? idx + 1 : null
  const total = sorted.length

  const pick = (e: (typeof sorted)[0] | undefined) =>
    e
      ? {
          rank: sorted.findIndex(x => x.agentId === e.agentId) + 1,
          agentId: e.agentId,
          displayName: e.displayName,
          poolLabel: e.poolLabel,
          pnlNetUsd: e.pnlNetUsd,
          winRate: e.winRate,
          actions: e.actions,
          score: e.score,
        }
      : null

  const entry = idx >= 0 ? pick(sorted[idx]!) : null
  const neighbourAbove = idx > 0 ? pick(sorted[idx - 1]!) : null
  const neighbourBelow = idx >= 0 && idx < sorted.length - 1 ? pick(sorted[idx + 1]!) : null

  return NextResponse.json({
    agentId,
    arenaPoolId,
    chainId,
    range,
    rank,
    total,
    entry,
    neighbourAbove,
    neighbourBelow,
  })
}
