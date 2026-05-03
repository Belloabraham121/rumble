import type { ArenaPoolId } from "@/lib/agents/arena-pools"

export type LivePricePayload = {
  arenaPoolId: ArenaPoolId
  chainId: number
  poolAddress?: string
  token0Symbol?: string
  token1Symbol?: string
  token0Price?: string
  token1Price?: string
  token0PriceUsd?: string
  token1PriceUsd?: string
  displayUsd?: string
  tick?: string
  sqrtPriceX96?: string
  source: "subgraph" | "chainlink" | "stale"
  stale?: boolean
  fetchedAt: string
}

export type PoolCandle = {
  periodStartUnix: number
  open: string
  high: string
  low: string
  close: string
  volumeUsd?: string
  tvlUsd?: string
}

export type PoolCandlesPayload = {
  arenaPoolId: ArenaPoolId
  chainId: number
  granularity: "minute" | "hour"
  candles: PoolCandle[]
  configured: boolean
  updatedAt: string
}

export type ArenaPoolsListRow = {
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

export type ArenaPoolsListPayload = {
  pools: ArenaPoolsListRow[]
  hasSubgraph: boolean
  updatedAt: string
}
