import "server-only"

import { getRomboServerEnv } from "@/lib/rombo/server-env"

export type SubgraphPoolStats = {
  poolAddress: string
  totalValueLockedUsd?: string
  volumeUsd?: string
  feesUsd?: string
  txCount?: string
}

export type SubgraphPoolSpot = {
  poolAddress: string
  feeTier: number
  token0: { address: string; symbol?: string; decimals?: number }
  token1: { address: string; symbol?: string; decimals?: number }
  /** Price of token0 expressed in token1 (raw subgraph field). */
  token0Price: string
  /** Price of token1 expressed in token0 (raw subgraph field). */
  token1Price: string
  tick?: string
  sqrtPriceX96?: string
  token0PriceUsd?: string
  token1PriceUsd?: string
  /** Pass-through for USD fallbacks when bundle ETH/USD is missing. */
  token0DerivedEth?: string
  token1DerivedEth?: string
  totalValueLockedUsd?: string
  volumeUsd24h?: string
  feesUsd24h?: string
}

export type SubgraphCandleGranularity = "hour" | "minute"

export type SubgraphPoolCandle = {
  /** Unix seconds — start of the OHLC bucket. */
  periodStartUnix: number
  open: string
  high: string
  low: string
  close: string
  volumeUsd?: string
  tvlUsd?: string
}

type GraphqlEnvelope<T> = {
  data?: T
  errors?: { message?: string }[]
}

/** POST GraphQL to an explicit subgraph HTTP endpoint (used by env-default queries + `/api/data/subgraph`). */
export async function postSubgraphAt<T>(
  subgraphHttpUrl: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(subgraphHttpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Subgraph HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  let parsed: GraphqlEnvelope<T>
  try {
    parsed = JSON.parse(text) as GraphqlEnvelope<T>
  } catch {
    throw new Error("Subgraph returned non-JSON.")
  }

  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map(e => e.message).filter(Boolean).join("; ") || "Subgraph GraphQL error.")
  }
  if (!parsed.data) {
    throw new Error("Subgraph returned empty data.")
  }
  return parsed.data
}

async function postSubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { uniswapV3SubgraphUrl } = getRomboServerEnv()
  if (!uniswapV3SubgraphUrl) {
    throw new Error("UNISWAP_V3_SUBGRAPH_URL is not configured.")
  }

  return postSubgraphAt<T>(uniswapV3SubgraphUrl, query, variables)
}

export type SubgraphEndpointMeta = {
  block?: { number?: number; hash?: string }
  deployment?: string
  hasIndexingErrors?: boolean
}

export type SubgraphEndpointDetails = {
  meta?: SubgraphEndpointMeta
  /** Present on Uniswap V3–style subgraphs; omitted when schema has no `bundles`. */
  bundleEthPriceUsd?: string
  bundleProbeSkippedReason?: string
}

/**
 * Lightweight health/discovery for a subgraph URL: `_meta` plus optional `bundles` ETH/USD probe.
 */
export async function fetchSubgraphEndpointDetails(subgraphHttpUrl: string): Promise<SubgraphEndpointDetails> {
  const metaQuery = `
    query SubgraphMeta {
      _meta {
        block { number hash }
        deployment
        hasIndexingErrors
      }
    }
  `
  const metaData = await postSubgraphAt<{ _meta?: SubgraphEndpointMeta }>(subgraphHttpUrl, metaQuery, {})
  const meta = metaData._meta

  let bundleEthPriceUsd: string | undefined
  let bundleProbeSkippedReason: string | undefined
  const bundleQuery = `
    query BundleProbe {
      bundles(first: 1) {
        id
        ethPriceUSD
      }
    }
  `
  try {
    const bundleData = await postSubgraphAt<{ bundles?: { id?: string; ethPriceUSD?: string }[] }>(
      subgraphHttpUrl,
      bundleQuery,
      {},
    )
    bundleEthPriceUsd = bundleData.bundles?.[0]?.ethPriceUSD ?? undefined
  } catch (e) {
    bundleProbeSkippedReason = e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400)
  }

  return {
    meta,
    bundleEthPriceUsd,
    bundleProbeSkippedReason,
  }
}

function mapPoolEntity(pool: {
  id: string
  totalValueLockedUSD?: string
  volumeUSD?: string
  feesUSD?: string
  txCount?: string
}): SubgraphPoolStats {
  return {
    poolAddress: pool.id,
    totalValueLockedUsd: pool.totalValueLockedUSD,
    volumeUsd: pool.volumeUSD,
    feesUsd: pool.feesUSD,
    txCount: pool.txCount,
  }
}

/** Fetch a single V3 pool by contract address (subgraph `id` is lowercased pool address). */
export async function fetchV3PoolStatsByAddress(poolAddress: string): Promise<SubgraphPoolStats | null> {
  const id = poolAddress.trim().toLowerCase()
  const query = `
    query PoolById($id: ID!) {
      pool(id: $id) {
        id
        totalValueLockedUSD
        volumeUSD
        feesUSD
        txCount
      }
    }
  `
  const data = await postSubgraph<{ pool: Record<string, string> | null }>(query, { id })
  if (!data.pool) return null
  return mapPoolEntity(data.pool as { id: string; totalValueLockedUSD?: string; volumeUSD?: string; feesUSD?: string; txCount?: string })
}

/**
 * Fetch pool stats by sorted token addresses + fee tier (Uniswap V3 subgraph schema).
 * `feeTier` is the uint24 fee param (e.g. 500 for 0.05%).
 */
export async function fetchV3PoolStatsByPair(input: {
  token0Address: string
  token1Address: string
  feeTier: number
}): Promise<SubgraphPoolStats | null> {
  const token0 = input.token0Address.trim().toLowerCase()
  const token1 = input.token1Address.trim().toLowerCase()
  const feeTier = String(input.feeTier)

  const query = `
    query PoolsByPair($token0: String!, $token1: String!, $feeTier: BigInt!) {
      pools(where: { token0: $token0, token1: $token1, feeTier: $feeTier }, first: 1) {
        id
        totalValueLockedUSD
        volumeUSD
        feesUSD
        txCount
      }
    }
  `

  const data = await postSubgraph<{ pools: Record<string, string>[] }>(query, {
    token0,
    token1,
    feeTier,
  })
  const pool = data.pools?.[0]
  if (!pool) return null
  return mapPoolEntity(pool as { id: string; totalValueLockedUSD?: string; volumeUSD?: string; feesUSD?: string; txCount?: string })
}

type SubgraphPoolSpotRaw = {
  id: string
  feeTier?: string
  tick?: string
  sqrtPrice?: string
  token0Price?: string
  token1Price?: string
  totalValueLockedUSD?: string
  volumeUSD?: string
  feesUSD?: string
  token0?: { id?: string; symbol?: string; decimals?: string; derivedETH?: string }
  token1?: { id?: string; symbol?: string; decimals?: string; derivedETH?: string }
  poolDayData?: {
    volumeUSD?: string
    feesUSD?: string
  }[]
}

function parseDecimals(raw?: string): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function safeMul(a?: string, b?: string): string | undefined {
  if (!a || !b) return undefined
  const an = Number(a)
  const bn = Number(b)
  if (!Number.isFinite(an) || !Number.isFinite(bn)) return undefined
  const v = an * bn
  if (!Number.isFinite(v)) return undefined
  return String(v)
}

function mapPoolSpot(raw: SubgraphPoolSpotRaw, ethUsd?: string): SubgraphPoolSpot {
  const token0 = {
    address: raw.token0?.id ?? "",
    symbol: raw.token0?.symbol,
    decimals: parseDecimals(raw.token0?.decimals),
  }
  const token1 = {
    address: raw.token1?.id ?? "",
    symbol: raw.token1?.symbol,
    decimals: parseDecimals(raw.token1?.decimals),
  }

  const token0DerivedEth = raw.token0?.derivedETH
  const token1DerivedEth = raw.token1?.derivedETH

  const token0PriceUsd = safeMul(token0DerivedEth, ethUsd)
  const token1PriceUsd = safeMul(token1DerivedEth, ethUsd)

  const day = raw.poolDayData?.[0]

  return {
    poolAddress: raw.id,
    feeTier: Number(raw.feeTier ?? 0),
    token0,
    token1,
    token0Price: raw.token0Price ?? "",
    token1Price: raw.token1Price ?? "",
    tick: raw.tick,
    sqrtPriceX96: raw.sqrtPrice,
    token0PriceUsd,
    token1PriceUsd,
    token0DerivedEth,
    token1DerivedEth,
    totalValueLockedUsd: raw.totalValueLockedUSD,
    volumeUsd24h: day?.volumeUSD,
    feesUsd24h: day?.feesUSD,
  }
}

/** Subgraph `bundle` is often empty on testnets; `ROMBO_ETH_USD_REF` fills the gap for derivedETH×ETH. */
function effectiveBundleEthUsd(bundleEth?: string): string | undefined {
  if (bundleEth) {
    const n = Number(bundleEth)
    if (Number.isFinite(n) && n > 0) return bundleEth
  }
  const ref = getRomboServerEnv().romboEthUsdRef
  if (ref != null && Number.isFinite(ref) && ref > 0) return String(ref)
  return undefined
}

async function fetchEthUsdFromBundle(): Promise<string | undefined> {
  try {
    const data = await postSubgraph<{ bundle: { ethPriceUSD?: string } | null }>(
      `query Bundle { bundle(id: "1") { ethPriceUSD } }`,
      {},
    )
    return data.bundle?.ethPriceUSD
  } catch {
    return undefined
  }
}

/** Spot price + live fundamentals for a pool address (subgraph `id` = lowercased pool). */
export async function fetchV3PoolSpotByAddress(poolAddress: string): Promise<SubgraphPoolSpot | null> {
  const id = poolAddress.trim().toLowerCase()
  const query = `
    query PoolSpot($id: ID!) {
      pool(id: $id) {
        id
        feeTier
        tick
        sqrtPrice
        token0Price
        token1Price
        totalValueLockedUSD
        volumeUSD
        feesUSD
        token0 { id symbol decimals derivedETH }
        token1 { id symbol decimals derivedETH }
        poolDayData(first: 1, orderBy: date, orderDirection: desc) {
          volumeUSD
          feesUSD
        }
      }
    }
  `
  const [data, ethUsd] = await Promise.all([
    postSubgraph<{ pool: SubgraphPoolSpotRaw | null }>(query, { id }),
    fetchEthUsdFromBundle(),
  ])
  if (!data.pool) return null
  return mapPoolSpot(data.pool, effectiveBundleEthUsd(ethUsd))
}

/** Spot + fundamentals by (token0, token1, feeTier). Returns first matching pool. */
export async function fetchV3PoolSpotByPair(input: {
  token0Address: string
  token1Address: string
  feeTier: number
}): Promise<SubgraphPoolSpot | null> {
  const token0 = input.token0Address.trim().toLowerCase()
  const token1 = input.token1Address.trim().toLowerCase()
  const feeTier = String(input.feeTier)

  const query = `
    query PoolSpotByPair($token0: String!, $token1: String!, $feeTier: BigInt!) {
      pools(where: { token0: $token0, token1: $token1, feeTier: $feeTier }, first: 1) {
        id
        feeTier
        tick
        sqrtPrice
        token0Price
        token1Price
        totalValueLockedUSD
        volumeUSD
        feesUSD
        token0 { id symbol decimals derivedETH }
        token1 { id symbol decimals derivedETH }
        poolDayData(first: 1, orderBy: date, orderDirection: desc) {
          volumeUSD
          feesUSD
        }
      }
    }
  `

  const [data, ethUsd] = await Promise.all([
    postSubgraph<{ pools: SubgraphPoolSpotRaw[] }>(query, { token0, token1, feeTier }),
    fetchEthUsdFromBundle(),
  ])
  const pool = data.pools?.[0]
  if (!pool) return null
  return mapPoolSpot(pool, effectiveBundleEthUsd(ethUsd))
}

/** Fetch OHLC candles for a pool. */
export async function fetchV3PoolCandles(input: {
  poolAddress: string
  granularity: SubgraphCandleGranularity
  /** Max bars to return (cap 500). */
  limit?: number
}): Promise<SubgraphPoolCandle[]> {
  const id = input.poolAddress.trim().toLowerCase()
  const first = Math.min(Math.max(input.limit ?? 120, 1), 500)

  // Canonical Uniswap v3 subgraphs expose PoolHourData / PoolDayData only; many deployments
  // (incl. testnets) have no `poolMinuteDatas` root field. Hourly OHLC is used for both granularities.
  const entity = "poolHourDatas"
  const query = `
    query PoolCandles($pool: String!, $first: Int!) {
      ${entity}(where: { pool: $pool }, first: $first, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        open
        high
        low
        close
        volumeUSD
        tvlUSD
      }
    }
  `

  const data = await postSubgraph<Record<string, {
    periodStartUnix: string | number
    open: string
    high: string
    low: string
    close: string
    volumeUSD?: string
    tvlUSD?: string
  }[]>>(query, { pool: id, first })

  const rows = data[entity] ?? []
  return rows
    .map((r) => ({
      periodStartUnix:
        typeof r.periodStartUnix === "string" ? Number(r.periodStartUnix) : r.periodStartUnix,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volumeUsd: r.volumeUSD,
      tvlUsd: r.tvlUSD,
    }))
    .filter((r) => Number.isFinite(r.periodStartUnix))
    .sort((a, b) => a.periodStartUnix - b.periodStartUnix)
}
