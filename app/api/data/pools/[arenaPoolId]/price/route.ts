import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import {
  isPoolPriceFresh,
  refreshPoolPrice,
  resolveArenaPoolContext,
  type ArenaPoolLiveSnapshot,
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

  if (!env.hasMongo && !env.hasSubgraph) {
    return NextResponse.json(
      {
        error:
          "Configure MONGODB_URI and/or UNISWAP_V3_SUBGRAPH_URL (with THE_GRAPH_API_KEY for gateway.thegraph.com) so pool prices can be loaded.",
        code: "NO_DATA_SOURCE",
      },
      { status: 503 },
    )
  }

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
  let subgraphReason: string | undefined
  let subgraphFetchError: string | undefined

  if (!isPoolPriceFresh(cached) && env.hasSubgraph) {
    try {
      const outcome = await refreshPoolPrice(poolId)
      if (outcome.ok) {
        liveSnapshot = outcome.snapshot
        if (env.hasMongo) {
          cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: poolId })
        }
      } else {
        subgraphReason = outcome.reason
      }
    } catch (err) {
      subgraphFetchError = err instanceof Error ? err.message : String(err)
    }
  }

  const doc = cached ?? liveSnapshot
  if (!doc) {
    const chainMismatchHint =
      subgraphReason === "pool not found in subgraph"
        ? "UNISWAP_V3_SUBGRAPH_URL must be a Uniswap V3 subgraph for the same chain as ROMBO_TARGET_NETWORK / ROMBO_DEFAULT_CHAIN_ID (Base 8453 or Base Sepolia 84532). An Ethereum-mainnet subgraph returns no pools for Base token addresses."
        : undefined

    return NextResponse.json(
      {
        error: subgraphFetchError
          ? subgraphFetchError
          : subgraphReason
            ? subgraphReason
            : env.hasSubgraph
              ? "Pool price unavailable — see subgraphReason / pipeline."
              : "Subgraph not configured — set UNISWAP_V3_SUBGRAPH_URL.",
        code: subgraphFetchError
          ? "SUBGRAPH_HTTP_OR_GRAPHQL"
          : subgraphReason
            ? "SUBGRAPH_REFRESH_FAILED"
            : env.hasSubgraph
              ? "NO_POOL_PRICE"
              : "NO_SUBGRAPH",
        configured: env.hasSubgraph,
        hasMongo: env.hasMongo,
        arenaPoolId: poolId,
        chainId: ctx.chainId,
        chainSlug: ctx.chainSlug,
        pipeline:
          "POST UNISWAP_V3_SUBGRAPH_URL → Uniswap V3 `pools(where:{token0,token1,feeTier})` using `lib/trading/arena-pool-onchain.ts` token addresses for `chainSlug`; USD via bundle ETH×derivedETH.",
        subgraphReason,
        hint: chainMismatchHint,
      },
      { status: 503 },
    )
  }

  const fresh = isPoolPriceFresh(doc)

  return NextResponse.json({
    arenaPoolId: poolId,
    chainId: doc.chainId,
    chainSlug: ctx.chainSlug,
    upstream: "uniswap-v3-subgraph",
    poolAddress: doc.poolAddress,
    token0Symbol: doc.token0Symbol,
    token1Symbol: doc.token1Symbol,
    token0Price: doc.token0Price,
    token1Price: doc.token1Price,
    token0PriceUsd: doc.token0PriceUsd,
    token1PriceUsd: doc.token1PriceUsd,
    displayUsd: doc.displayUsd,
    tick: doc.tick,
    sqrtPriceX96: doc.sqrtPriceX96,
    source: fresh ? "subgraph" : "stale",
    stale: !fresh,
    fetchedAt: doc.fetchedAt.toISOString(),
  })
}
