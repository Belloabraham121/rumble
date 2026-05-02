import { NextResponse } from "next/server"
import { ARENA_POOLS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import {
  refreshAllArenaPoolPrices,
  refreshPoolCandles,
} from "@/lib/data/live-pool-tick"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

/**
 * Warm the pool-price + candles caches for every arena pool on the default chain.
 * Wired via `vercel.json` cron. Idempotent; safe to hit repeatedly from dev.
 */
async function run(req: Request) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const env = getRumbleServerEnv()
  if (!env.hasSubgraph) {
    return NextResponse.json(
      { error: "UNISWAP_V3_SUBGRAPH_URL is not configured.", configured: false },
      { status: 503 },
    )
  }

  const priceOutcomes = await refreshAllArenaPoolPrices()
  const candleOutcomes: Awaited<ReturnType<typeof refreshPoolCandles>>[] = []
  for (const pool of ARENA_POOLS) {
    const out = await refreshPoolCandles({
      arenaPoolId: pool.id as ArenaPoolId,
      granularity: "minute",
      limit: 120,
    })
    candleOutcomes.push(out)
  }

  return NextResponse.json({
    ok: true,
    prices: priceOutcomes,
    candles: candleOutcomes,
    ranAt: new Date().toISOString(),
  })
}

export const GET = run
export const POST = run
