/** Range presets for `GET /api/agents/[agentId]/metrics` and arena leaderboard windows. */
export type MetricsRange = "24h" | "7d" | "30d" | "all"

export type AgentMetricsSnapshot = {
  range: MetricsRange
  /** Successful Uniswap Trading/LP calls (`status=ok`, execution kinds only). */
  actions: number
  /** Action attempts that settled on-chain as success. */
  fills: number
  /** Evaluator skips + failed/reverted finalized attempts (see `lib/agents/metrics.ts`). */
  skips: number
  /** `fills / (fills + skips)` — 0 when denominator is 0. */
  winRate: number
  /** Σ gasUsed × effectiveGasPrice (wei) as decimal ETH. */
  gasEth: number
  /** Gas cost in USD using spot ETH/USD. */
  gasUsd: number
  /** Realised swap PnL in USD (v1 stub: 0 until quote amounts are persisted). */
  swapPnlUsd: number
  /** swapPnlUsd − gasUsd (meaningful when swap leg is populated). */
  netPnlUsd: number
  /** ETH/USD reference used for `gasUsd`. */
  ethUsd: number
}
