export const COLLECTIONS = {
  users: "users",
  /** Agent definitions + runtime state per Rombo user (dashboard source of truth when synced). */
  agents: "agents",
  agentWallets: "agent_wallets",
  /** Uniswap quote/swap/order audit rows + idempotency keys */
  tradingAttempts: "trading_attempts",
  /** Last known broadcast nonce per wallet + chain (reconciliation). */
  walletChainNonces: "wallet_chain_nonces",
  /** Agent LP positions — NFT token id keyed by agent + arena pool (+ chain). */
  lpPositions: "lp_positions",
  /** User-deployed Uniswap v4 lab pools (auto-registered on successful `/lp/create`). */
  labPools: "lab_pools",
  /** Cached Uniswap V3 pool stats from subgraph / data APIs (TVL, volume, fees). */
  indexedPoolSnapshots: "indexed_pool_snapshots",
  /** Live pool spot prices (short-retention cache, TTL-swept). */
  poolPrices: "pool_prices",
  /** OHLC candles for arena pools (subgraph-sourced; short retention). */
  poolCandles: "pool_candles",
  /** On-chain receipts linked to agents / Rombo users (Execution log → real tx). */
  onchainReceipts: "onchain_receipts",
  /** Idempotent record of inbound indexer webhook deliveries (debug / replay). */
  indexerWebhookDeliveries: "indexer_webhook_deliveries",
  /** Server-side agent tick decisions + execution outcomes. */
  agentRuns: "agent_runs",
  /** Cached Phase 4 dashboard metrics per agent (refreshed after ticks + read-through API). */
  agentMetrics: "agent_metrics",
  /** Phase 5 arena leaderboard rows per pool + chain + range (cron rebuild). */
  arenaLeaderboardCache: "arena_leaderboard_cache",
} as const
