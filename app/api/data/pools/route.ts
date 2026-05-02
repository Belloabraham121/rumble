import { NextResponse } from "next/server"
import { ARENA_POOLS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import {
  isPoolPriceFresh,
  refreshPoolPrice,
  resolveArenaPoolContext,
  type RefreshPoolPriceOutcome,
} from "@/lib/data/live-pool-tick"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export type ArenaPoolPriceRow = {
  arenaPoolId: ArenaPoolId
  chainId: number
  label: string
  livePairTag: string
  feeTier: number
  poolAddress?: string
  displayUsd?: string
  token0Symbol?: string
  token1Symbol?: string
  totalValueLockedUsd?: string
  volumeUsd24h?: string
  feesUsd24h?: string
  source: "subgraph" | "stale" | "unavailable"
  fetchedAt?: string
  stale?: boolean
}

export const dynamic = "force-dynamic"

/** List the three arena pools with latest cached spot + 24h fundamentals. */
export async function GET() {
  const env = getRomboServerEnv()
  const rows: ArenaPoolPriceRow[] = []

  for (const pool of ARENA_POOLS) {
    const ctx = resolveArenaPoolContext(pool.id as ArenaPoolId)
    if (!ctx) {
      rows.push({
        arenaPoolId: pool.id as ArenaPoolId,
        chainId: env.defaultChainId,
        label: pool.label,
        livePairTag: pool.livePairTag,
        feeTier: 0,
        source: "unavailable",
      })
      continue
    }

    let cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: pool.id })
    let refreshOutcome: RefreshPoolPriceOutcome | null = null

    if (!isPoolPriceFresh(cached) && env.hasSubgraph) {
      refreshOutcome = await refreshPoolPrice(pool.id as ArenaPoolId)
      if (refreshOutcome.ok) {
        cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: pool.id })
      }
    }

    const fresh = isPoolPriceFresh(cached)

    if (cached) {
      rows.push({
        arenaPoolId: pool.id as ArenaPoolId,
        chainId: ctx.chainId,
        label: pool.label,
        livePairTag: pool.livePairTag,
        feeTier: ctx.feeTier,
        poolAddress: cached.poolAddress,
        displayUsd: cached.displayUsd,
        token0Symbol: cached.token0Symbol,
        token1Symbol: cached.token1Symbol,
        totalValueLockedUsd: cached.totalValueLockedUsd,
        volumeUsd24h: cached.volumeUsd24h,
        feesUsd24h: cached.feesUsd24h,
        source: fresh ? "subgraph" : "stale",
        fetchedAt: cached.fetchedAt.toISOString(),
        stale: !fresh,
      })
    } else {
      rows.push({
        arenaPoolId: pool.id as ArenaPoolId,
        chainId: ctx.chainId,
        label: pool.label,
        livePairTag: pool.livePairTag,
        feeTier: ctx.feeTier,
        source: "unavailable",
      })
    }
  }

  return NextResponse.json({
    pools: rows,
    hasSubgraph: env.hasSubgraph,
    updatedAt: new Date().toISOString(),
  })
}
