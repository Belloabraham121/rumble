/** Dashboard-only activity log (mock execution lines until backend exists). */
export type ExecutionKind = "swap" | "add_liquidity" | "remove_liquidity" | "claim_fees" | "close_position" | "box_skipped"

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
  pnlEth: number
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
  pnlEth?: number
  gasGwei?: number
  txShort?: string
}
