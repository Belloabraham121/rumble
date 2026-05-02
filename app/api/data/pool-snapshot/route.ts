import { NextResponse } from "next/server"
import { ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { upsertIndexedPoolSnapshot } from "@/lib/db/indexed-pool-snapshots.repo"
import { fetchV3PoolStatsByAddress, fetchV3PoolStatsByPair } from "@/lib/integrations/uniswap/subgraph"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"
import { slugFromChainId } from "@/lib/rumble/chain-config"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/**
 * Public-ish pool stats for dashboard / leaderboard (on-chain aggregate via subgraph).
 * Configure `UNISWAP_V3_SUBGRAPH_URL` for your chain (Goldsky / The Graph hosted subgraph).
 *
 * Query: `chainId` (required), and either `poolAddress` **or** `arenaPoolId`.
 */
export async function GET(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasSubgraph) {
    return NextResponse.json(
      { error: "UNISWAP_V3_SUBGRAPH_URL is not configured.", configured: false },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const chainIdRaw = url.searchParams.get("chainId")
  const poolAddress = url.searchParams.get("poolAddress")
  const arenaPoolId = url.searchParams.get("arenaPoolId")

  const chainId = chainIdRaw ? Number(chainIdRaw) : NaN
  if (!Number.isFinite(chainId)) {
    return NextResponse.json({ error: "Invalid or missing chainId" }, { status: 400 })
  }

  const slug = slugFromChainId(chainId)
  if (!slug) {
    return NextResponse.json({ error: "Unsupported chainId for Rumble slug mapping" }, { status: 400 })
  }

  try {
    let stats = null as Awaited<ReturnType<typeof fetchV3PoolStatsByAddress>>

    if (poolAddress?.trim()) {
      stats = await fetchV3PoolStatsByAddress(poolAddress)
    } else if (arenaPoolId && ARENA_POOL_IDS.includes(arenaPoolId as ArenaPoolId)) {
      const meta = getArenaPoolOnChain(arenaPoolId as ArenaPoolId, slug)
      if (!meta) {
        return NextResponse.json({ error: "Arena pool not configured for this chain" }, { status: 404 })
      }
      stats = await fetchV3PoolStatsByPair({
        token0Address: meta.token0.address,
        token1Address: meta.token1.address,
        feeTier: meta.feeTier,
      })
    } else {
      return NextResponse.json(
        { error: "Provide poolAddress=0x… or a valid arenaPoolId (eth-usdc, wbtc-eth, usdc-usdt)" },
        { status: 400 },
      )
    }

    if (!stats) {
      return NextResponse.json({ error: "Pool not found in subgraph", chainId }, { status: 404 })
    }

    await upsertIndexedPoolSnapshot({
      chainId,
      poolAddress: stats.poolAddress,
      arenaPoolId: arenaPoolId ?? undefined,
      totalValueLockedUsd: stats.totalValueLockedUsd,
      volumeUsd: stats.volumeUsd,
      feesUsd: stats.feesUsd,
      txCount: stats.txCount,
      source: "subgraph",
    })

    return NextResponse.json({
      chainId,
      arenaPoolId: arenaPoolId ?? undefined,
      poolAddress: stats.poolAddress,
      totalValueLockedUsd: stats.totalValueLockedUsd,
      volumeUsd: stats.volumeUsd,
      feesUsd: stats.feesUsd,
      txCount: stats.txCount,
      cached: true,
    })
  } catch (e) {
    console.error("[pool-snapshot]", e)
    const message = e instanceof Error ? e.message : "Subgraph request failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
