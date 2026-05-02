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
    const out = await refreshPoolPrice(poolId)
    if (out.ok) cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })
  }

  if (!cached) {
    return NextResponse.json(
      {
        error: env.hasSubgraph
          ? "Pool stats not available yet — cron has not warmed the cache."
          : "Subgraph not configured.",
        configured: env.hasSubgraph,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    arenaPoolId: poolId,
    chainId: cached.chainId,
    poolAddress: cached.poolAddress,
    totalValueLockedUsd: cached.totalValueLockedUsd,
    volumeUsd24h: cached.volumeUsd24h,
    feesUsd24h: cached.feesUsd24h,
    fetchedAt: cached.fetchedAt.toISOString(),
  })
}
