import "server-only"

import { getRomboServerEnv } from "@/lib/rombo/server-env"

export type SubgraphPoolStats = {
  poolAddress: string
  totalValueLockedUsd?: string
  volumeUsd?: string
  feesUsd?: string
  txCount?: string
}

type GraphqlEnvelope<T> = {
  data?: T
  errors?: { message?: string }[]
}

async function postSubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { uniswapV3SubgraphUrl } = getRomboServerEnv()
  if (!uniswapV3SubgraphUrl) {
    throw new Error("UNISWAP_V3_SUBGRAPH_URL is not configured.")
  }

  const res = await fetch(uniswapV3SubgraphUrl, {
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
