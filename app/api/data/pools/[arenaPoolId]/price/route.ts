import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import {
  isPoolPriceFresh,
  refreshPoolPrice,
  resolveArenaPoolContext,
} from "@/lib/data/live-pool-tick"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ arenaPoolId: string }> },
) {
  const { arenaPoolId } = await params

  if (!ARENA_POOL_IDS.includes(arenaPoolId as ArenaPoolId)) {
    return NextResponse.json({ error: "Invalid arenaPoolId" }, { status: 400 })
  }

  const poolId = arenaPoolId as ArenaPoolId
  const env = getRomboServerEnv()
  const ctx = resolveArenaPoolContext(poolId)
  if (!ctx) {
    return NextResponse.json(
      { error: "Arena pool not configured for the default chain" },
      { status: 404 },
    )
  }

  let cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })

  if (!isPoolPriceFresh(cached) && env.hasSubgraph) {
    const outcome = await refreshPoolPrice(poolId)
    if (outcome.ok) {
      cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })
    }
  }

  if (!cached) {
    return NextResponse.json(
      {
        error: env.hasSubgraph
          ? "Pool price not available yet — cron has not warmed the cache."
          : "Subgraph not configured (UNISWAP_V3_SUBGRAPH_URL).",
        configured: env.hasSubgraph,
      },
      { status: 503 },
    )
  }

  const fresh = isPoolPriceFresh(cached)

  return NextResponse.json({
    arenaPoolId: poolId,
    chainId: cached.chainId,
    poolAddress: cached.poolAddress,
    token0Symbol: cached.token0Symbol,
    token1Symbol: cached.token1Symbol,
    token0Price: cached.token0Price,
    token1Price: cached.token1Price,
    token0PriceUsd: cached.token0PriceUsd,
    token1PriceUsd: cached.token1PriceUsd,
    displayUsd: cached.displayUsd,
    tick: cached.tick,
    sqrtPriceX96: cached.sqrtPriceX96,
    source: fresh ? "subgraph" : "stale",
    stale: !fresh,
    fetchedAt: cached.fetchedAt.toISOString(),
  })
}
