/**
 * Long-running **polling** (RPC `eth_getTransactionReceipt`) belongs in a worker or cron — not in a Vercel
 * route timeout. After each confirmation, POST the normalized fields to **`/api/indexer/receipt`** with the
 * same `agentId` / `romboUserIdHex` context as the originating swap/LP flow.
 */
export {}
