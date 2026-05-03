/** Execution log row kinds (arena + on-chain join). */
export type ExecutionKind =
  | "swap"
  | "add_liquidity"
  | "remove_liquidity"
  | "claim_fees"
  | "close_position"
  | "box_skipped"
  | "error"

/** Emitted when a scrolling box resolves at the head column (chart → activity feed). */
export type ArenaResolutionPayload = {
  hit: boolean
  mult: number
  payoutEth: number
}

export type ArenaAgentRow = {
  id: string
  name: string
  pool: string
  /** Legacy mock rows: ETH-shaped simulator units (converted to USDC in UI). */
  pnlEth: number
  /** When set (real user row), PnL column uses USD directly — no ETH→USDC conversion. */
  pnlNetUsd?: number
  winRate: number
  actions: number
  score: number
}

export type AgentActivityEvent = {
  id: string
  at: number
  kind: ExecutionKind
  title: string
  detail: string
  /** Human-readable rationale (strategy / guardrails) — UI-only until backend. */
  reason?: string
  pnlEth?: number
  gasGwei?: number
  txShort?: string
  txHash?: string
  chainId?: number
  blockNumber?: number
}
