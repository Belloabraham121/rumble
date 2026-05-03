import "server-only"

import { ARENA_POOLS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice, upsertPoolPrice } from "@/lib/data/pool-prices.repo"
import { upsertPoolCandles } from "@/lib/data/pool-candles.repo"
import {
  fetchV3PoolCandles,
  fetchV3PoolSpotByPair,
  type SubgraphCandleGranularity,
  type SubgraphPoolSpot,
} from "@/lib/integrations/uniswap/subgraph"
import { DEFAULT_ROMBO_CHAIN_SLUG, slugFromChainId } from "@/lib/rombo/chain-config"
import { getRomboServerEnv } from "@/lib/rombo/server-env"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"

export type ResolvedArenaPoolContext = {
  arenaPoolId: ArenaPoolId
  chainId: number
  chainSlug: string
  poolAddress?: string
  feeTier: number
  token0Symbol: string
  token1Symbol: string
}

export function resolveArenaPoolContext(
  arenaPoolId: ArenaPoolId,
  chainId?: number,
): ResolvedArenaPoolContext | null {
  const env = getRomboServerEnv()
  const cid = chainId ?? env.defaultChainId
  const slug = slugFromChainId(cid) ?? DEFAULT_ROMBO_CHAIN_SLUG
  const meta = getArenaPoolOnChain(arenaPoolId, slug)
  if (!meta) return null
  return {
    arenaPoolId,
    chainId: meta.chainId,
    chainSlug: meta.chainSlug,
    feeTier: meta.feeTier,
    token0Symbol: meta.token0.symbol,
    token1Symbol: meta.token1.symbol,
  }
}

/**
 * Picks the USD price we surface on the dashboard for a pool. For ETH/USDC-like pools we
 * prefer the *non-stable* leg (ETH→USD). For WBTC/ETH we surface WBTC→USD. For USDC/USDT
 * we surface token0Price (peg ≈ 1) with a USD fallback.
 */
export function pickDisplayUsd(
  spot: SubgraphPoolSpot,
  arenaPoolId: ArenaPoolId,
): string | undefined {
  switch (arenaPoolId) {
    case "eth-usdc": {
      // USD value of 1 ETH — the non-stable side.
      const t0Stable = /usdc|usdt/i.test(spot.token0.symbol ?? "")
      return t0Stable ? spot.token1PriceUsd : spot.token0PriceUsd
    }
    case "wbtc-eth": {
      // USD value of 1 WBTC
      const t0IsBtc = /btc/i.test(spot.token0.symbol ?? "")
      return t0IsBtc ? spot.token0PriceUsd : spot.token1PriceUsd
    }
    case "usdc-usdt":
      return spot.token0PriceUsd ?? spot.token0Price
    default:
      return spot.token0PriceUsd
  }
}

function positiveUsdString(raw?: string): boolean {
  if (!raw) return false
  const n = Number(raw)
  return Number.isFinite(n) && n > 0
}

/**
 * Subgraph `bundle` / `derivedETH` often yields empty USD on testnets. Fall back to pool
 * `token*Price` ratios (USDC per WETH for canonical ETH/USDC) and `ROMBO_ETH_USD_REF`.
 */
export function resolveDisplayUsdForArena(
  spot: SubgraphPoolSpot,
  arenaPoolId: ArenaPoolId,
): string | undefined {
  const primary = pickDisplayUsd(spot, arenaPoolId)
  if (positiveUsdString(primary)) return primary

  const env = getRomboServerEnv()
  const refEthUsd = env.romboEthUsdRef
  const t0 = spot.token0.symbol ?? ""
  const t1 = spot.token1.symbol ?? ""
  const t0Stable = /usdc|usdt/i.test(t0)
  const t1Stable = /usdc|usdt/i.test(t1)

  switch (arenaPoolId) {
    case "eth-usdc": {
      // token1Price = price of WETH in token0 (USDC) ≈ USDC per 1 WETH when token0 is USDC.
      if (t0Stable && positiveUsdString(spot.token1Price)) return spot.token1Price
      if (t1Stable && positiveUsdString(spot.token0Price)) return spot.token0Price
      if (refEthUsd != null && refEthUsd > 0) {
        const t0e = spot.token0DerivedEth
        const t1e = spot.token1DerivedEth
        if (t0Stable && positiveUsdString(t1e)) return String(Number(t1e) * refEthUsd)
        if (t1Stable && positiveUsdString(t0e)) return String(Number(t0e) * refEthUsd)
      }
      break
    }
    case "wbtc-eth": {
      const t0Btc = /btc/i.test(t0)
      if (refEthUsd != null && refEthUsd > 0) {
        const d = t0Btc ? spot.token0DerivedEth : spot.token1DerivedEth
        if (positiveUsdString(d)) return String(Number(d) * refEthUsd)
      }
      break
    }
    case "usdc-usdt": {
      if (positiveUsdString(spot.token0Price)) return spot.token0Price
      break
    }
    default:
      break
  }

  return primary
}

/** In-memory shape matching what we persist / return from GET pool price (no Mongo `_id`). */
export type ArenaPoolLiveSnapshot = {
  arenaPoolId: ArenaPoolId
  chainId: number
  poolAddress: string
  token0Price: string
  token1Price: string
  token0PriceUsd?: string
  token1PriceUsd?: string
  displayUsd?: string
  tick?: string
  sqrtPriceX96?: string
  token0Symbol?: string
  token1Symbol?: string
  totalValueLockedUsd?: string
  volumeUsd24h?: string
  feesUsd24h?: string
  fetchedAt: Date
}

export type RefreshPoolPriceOutcome =
  | {
      ok: true
      arenaPoolId: ArenaPoolId
      displayUsd?: string
      source: "subgraph"
      /** Always set on success — use when Mongo is off or cache read returns null. */
      snapshot: ArenaPoolLiveSnapshot
    }
  | { ok: false; arenaPoolId: ArenaPoolId; reason: string }

/** Fetch latest spot from subgraph, upsert cache when Mongo is available. Subgraph is the only live source today. */
export async function refreshPoolPrice(
  arenaPoolId: ArenaPoolId,
  chainId?: number,
): Promise<RefreshPoolPriceOutcome> {
  const env = getRomboServerEnv()
  if (!env.hasSubgraph) {
    return { ok: false, arenaPoolId, reason: "UNISWAP_V3_SUBGRAPH_URL not configured" }
  }

  const ctx = resolveArenaPoolContext(arenaPoolId, chainId)
  if (!ctx) return { ok: false, arenaPoolId, reason: "arena pool not configured for this chain" }

  const meta = getArenaPoolOnChain(arenaPoolId, ctx.chainSlug)
  if (!meta) return { ok: false, arenaPoolId, reason: "arena pool metadata missing" }

  const spot = await fetchV3PoolSpotByPair({
    token0Address: meta.token0.address,
    token1Address: meta.token1.address,
    feeTier: meta.feeTier,
  })
  if (!spot) return { ok: false, arenaPoolId, reason: "pool not found in subgraph" }

  const displayUsd = resolveDisplayUsdForArena(spot, arenaPoolId)
  const fetchedAt = new Date()

  await upsertPoolPrice({
    chainId: ctx.chainId,
    arenaPoolId,
    poolAddress: spot.poolAddress,
    token0Price: spot.token0Price,
    token1Price: spot.token1Price,
    token0PriceUsd: spot.token0PriceUsd,
    token1PriceUsd: spot.token1PriceUsd,
    displayUsd,
    tick: spot.tick,
    sqrtPriceX96: spot.sqrtPriceX96,
    token0Symbol: spot.token0.symbol,
    token1Symbol: spot.token1.symbol,
    totalValueLockedUsd: spot.totalValueLockedUsd,
    volumeUsd24h: spot.volumeUsd24h,
    feesUsd24h: spot.feesUsd24h,
    source: "subgraph",
    fetchedAt,
  })

  const snapshot: ArenaPoolLiveSnapshot = {
    arenaPoolId,
    chainId: ctx.chainId,
    poolAddress: spot.poolAddress,
    token0Price: spot.token0Price,
    token1Price: spot.token1Price,
    token0PriceUsd: spot.token0PriceUsd,
    token1PriceUsd: spot.token1PriceUsd,
    displayUsd,
    tick: spot.tick,
    sqrtPriceX96: spot.sqrtPriceX96,
    token0Symbol: spot.token0.symbol,
    token1Symbol: spot.token1.symbol,
    totalValueLockedUsd: spot.totalValueLockedUsd,
    volumeUsd24h: spot.volumeUsd24h,
    feesUsd24h: spot.feesUsd24h,
    fetchedAt,
  }

  return { ok: true, arenaPoolId, displayUsd, source: "subgraph", snapshot }
}

/** Runs `refreshPoolPrice` for every arena pool on the default chain. */
export async function refreshAllArenaPoolPrices(chainId?: number): Promise<RefreshPoolPriceOutcome[]> {
  const out: RefreshPoolPriceOutcome[] = []
  for (const pool of ARENA_POOLS) {
    const r = await refreshPoolPrice(pool.id as ArenaPoolId, chainId)
    out.push(r)
  }
  return out
}

export type RefreshPoolCandlesOutcome =
  | { ok: true; arenaPoolId: ArenaPoolId; granularity: SubgraphCandleGranularity; rows: number }
  | { ok: false; arenaPoolId: ArenaPoolId; reason: string }

export async function refreshPoolCandles(input: {
  arenaPoolId: ArenaPoolId
  granularity: SubgraphCandleGranularity
  limit?: number
  chainId?: number
}): Promise<RefreshPoolCandlesOutcome> {
  const env = getRomboServerEnv()
  if (!env.hasSubgraph) {
    return { ok: false, arenaPoolId: input.arenaPoolId, reason: "UNISWAP_V3_SUBGRAPH_URL not configured" }
  }

  const ctx = resolveArenaPoolContext(input.arenaPoolId, input.chainId)
  if (!ctx) return { ok: false, arenaPoolId: input.arenaPoolId, reason: "arena pool not configured for this chain" }

  const cached = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: input.arenaPoolId })
  let poolAddress = cached?.poolAddress

  if (!poolAddress) {
    // Warm the pool address by refreshing spot once.
    const warm = await refreshPoolPrice(input.arenaPoolId, input.chainId)
    if (!warm.ok) return { ok: false, arenaPoolId: input.arenaPoolId, reason: warm.reason }
    const re = await getPoolPrice({ chainId: ctx.chainId, arenaPoolId: input.arenaPoolId })
    poolAddress = re?.poolAddress
    if (!poolAddress) return { ok: false, arenaPoolId: input.arenaPoolId, reason: "pool address missing after refresh" }
  }

  const rows = await fetchV3PoolCandles({
    poolAddress,
    granularity: input.granularity,
    limit: input.limit,
  })

  const updated = await upsertPoolCandles({
    chainId: ctx.chainId,
    arenaPoolId: input.arenaPoolId,
    poolAddress,
    granularity: input.granularity,
    rows,
  })

  return { ok: true, arenaPoolId: input.arenaPoolId, granularity: input.granularity, rows: updated }
}

/** True when the cached price is within `ROMBO_POOL_PRICE_TTL_SECONDS`. */
export function isPoolPriceFresh(cached: { fetchedAt: Date } | null | undefined): boolean {
  if (!cached) return false
  const env = getRomboServerEnv()
  const ageSec = (Date.now() - new Date(cached.fetchedAt).getTime()) / 1000
  return Number.isFinite(ageSec) && ageSec <= env.poolPriceTtlSeconds
}
