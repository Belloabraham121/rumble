import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import {
  isPoolPriceFresh,
  refreshPoolPrice,
  resolveArenaPoolContext,
  type ArenaPoolLiveSnapshot,
} from "@/lib/data/live-pool-tick"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

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
  const env = getRumbleServerEnv()
  const ctx = resolveArenaPoolContext(poolId)
  if (!ctx) {
    return NextResponse.json(
      { error: "Arena pool not configured for the default chain" },
      { status: 404 },
    )
  }

  let cached = env.hasMongo
    ? await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })
    : null
  let liveSnapshot: ArenaPoolLiveSnapshot | undefined

  if (!isPoolPriceFresh(cached) && env.hasSubgraph) {
    const out = await refreshPoolPrice(poolId)
    if (out.ok) {
      liveSnapshot = out.snapshot
      if (env.hasMongo) {
        cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })
      }
    }
  }

  const doc = cached ?? liveSnapshot
  if (!doc) {
    return NextResponse.json(
      {
        error: env.hasSubgraph
          ? "Pool stats unavailable — subgraph did not return this pool or the request failed."
          : "Subgraph not configured.",
        configured: env.hasSubgraph,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    arenaPoolId: poolId,
    chainId: doc.chainId,
    poolAddress: doc.poolAddress,
    totalValueLockedUsd: doc.totalValueLockedUsd,
    volumeUsd24h: doc.volumeUsd24h,
    feesUsd24h: doc.feesUsd24h,
    fetchedAt: doc.fetchedAt.toISOString(),
  })
}
