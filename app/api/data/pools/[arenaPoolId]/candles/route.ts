import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { listPoolCandles } from "@/lib/data/pool-candles.repo"
import {
  refreshPoolCandles,
  resolveArenaPoolContext,
} from "@/lib/data/live-pool-tick"
import type { SubgraphCandleGranularity } from "@/lib/integrations/uniswap/subgraph"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

function parseGranularity(raw: string | null): SubgraphCandleGranularity {
  return raw === "hour" ? "hour" : "minute"
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ arenaPoolId: string }> },
) {
  const { arenaPoolId } = await params

  if (!ARENA_POOL_IDS.includes(arenaPoolId as ArenaPoolId)) {
    return NextResponse.json({ error: "Invalid arenaPoolId" }, { status: 400 })
  }

  const poolId = arenaPoolId as ArenaPoolId
  const env = getRumbleServerEnv()
  const url = new URL(req.url)
  const granularity = parseGranularity(url.searchParams.get("granularity"))
  const limitRaw = url.searchParams.get("limit")
  const limitParsed = limitRaw ? Number(limitRaw) : 120
  const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 500) : 120

  const ctx = resolveArenaPoolContext(poolId)
  if (!ctx) {
    return NextResponse.json(
      { error: "Arena pool not configured for the default chain" },
      { status: 404 },
    )
  }

  let rows = await listPoolCandles({
    chainId: ctx.chainId,
    arenaPoolId: poolId,
    granularity,
    limit,
  })

  if (rows.length === 0 && env.hasSubgraph) {
    const outcome = await refreshPoolCandles({
      arenaPoolId: poolId,
      granularity,
      limit,
    })
    if (outcome.ok) {
      rows = await listPoolCandles({
        chainId: ctx.chainId,
        arenaPoolId: poolId,
        granularity,
        limit,
      })
    }
  }

  return NextResponse.json({
    arenaPoolId: poolId,
    chainId: ctx.chainId,
    granularity,
    candles: rows.map((r) => ({
      periodStartUnix: r.periodStartUnix,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volumeUsd: r.volumeUsd,
      tvlUsd: r.tvlUsd,
    })),
    configured: env.hasSubgraph,
    updatedAt: new Date().toISOString(),
  })
}
