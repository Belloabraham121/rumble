export const COLLECTIONS = {
  users: "users",
  agentWallets: "agent_wallets",
  /** Uniswap quote/swap/order audit rows + idempotency keys */
  tradingAttempts: "trading_attempts",
  /** Last known broadcast nonce per wallet + chain (reconciliation). */
  walletChainNonces: "wallet_chain_nonces",
  /** Agent LP positions — NFT token id keyed by agent + arena pool (+ chain). */
  lpPositions: "lp_positions",
  /** Cached Uniswap V3 pool stats from subgraph / data APIs (TVL, volume, fees). */
  indexedPoolSnapshots: "indexed_pool_snapshots",
  /** On-chain receipts linked to agents / Rombo users (Execution log → real tx). */
  onchainReceipts: "onchain_receipts",
  /** Idempotent record of inbound indexer webhook deliveries (debug / replay). */
  indexerWebhookDeliveries: "indexer_webhook_deliveries",
} as const
