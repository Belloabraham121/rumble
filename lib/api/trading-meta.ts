import "server-only"

/** Strip Rombo-only fields before forwarding JSON to Uniswap Trading API. */
export const TRADING_REQUEST_META_KEYS = new Set([
  "permit2Disabled",
  "erc20EthEnabled",
  "agentConfig",
  "arenaPoolId",
  "arenaDirection",
  "agentId",
  "idempotencyKey",
  "broadcastNonce",
  "walletAddress",
])

export function stripTradingRequestMeta<T extends Record<string, unknown>>(body: T): Record<string, unknown> {
  const out = { ...body }
  for (const k of TRADING_REQUEST_META_KEYS) {
    delete out[k]
  }
  return out
}
