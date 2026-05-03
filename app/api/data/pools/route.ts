import { NextResponse } from "next/server"
import { ARENA_POOLS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import {
  isPoolPriceFresh,
  refreshPoolPrice,
  resolveArenaPoolContext,
  type ArenaPoolLiveSnapshot,
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
  source: "subgraph" | "chainlink" | "stale" | "unavailable"
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

    let cached = env.hasMongo
      ? await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: pool.id })
      : null
    let liveSnapshot: ArenaPoolLiveSnapshot | undefined

    const chainlinkCan =
      env.chainlinkSpotEnabled &&
      (ctx.chainId === 8453 || ctx.chainId === 84532)

    if (!isPoolPriceFresh(cached) && (env.hasSubgraph || chainlinkCan)) {
      const outcome = await refreshPoolPrice(pool.id as ArenaPoolId)
      if (outcome.ok) {
        liveSnapshot = outcome.snapshot
        if (env.hasMongo) {
          cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: pool.id })
        }
      }
    }

    const doc = cached ?? liveSnapshot
    const fresh = isPoolPriceFresh(doc)

    if (doc) {
      const rowSource =
        "source" in doc && doc.source === "chainlink" ? "chainlink" : "subgraph"
      rows.push({
        arenaPoolId: pool.id as ArenaPoolId,
        chainId: ctx.chainId,
        label: pool.label,
        livePairTag: pool.livePairTag,
        feeTier: ctx.feeTier,
        poolAddress: doc.poolAddress,
        displayUsd: doc.displayUsd,
        token0Symbol: doc.token0Symbol,
        token1Symbol: doc.token1Symbol,
        totalValueLockedUsd: doc.totalValueLockedUsd,
        volumeUsd24h: doc.volumeUsd24h,
        feesUsd24h: doc.feesUsd24h,
        source: fresh ? rowSource : "stale",
        fetchedAt: doc.fetchedAt.toISOString(),
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
