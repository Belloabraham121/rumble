import "server-only"

/** Rombo-only fields — never forward these to Uniswap. */
const ROMBO_ONLY_REQUEST_META_KEYS = new Set([
  "permit2Disabled",
  "erc20EthEnabled",
  "agentConfig",
  "arenaPoolId",
  "arenaDirection",
  "agentId",
  "idempotencyKey",
  "broadcastNonce",
])

/**
 * Same as `ROMBO_ONLY_REQUEST_META_KEYS` plus `walletAddress` — Uniswap **Trading** quote/swap bodies
 * use `swapper`, not `walletAddress`; clients often send the latter for Rombo audit only.
 */
export const TRADING_REQUEST_META_KEYS = new Set([
  ...ROMBO_ONLY_REQUEST_META_KEYS,
  "walletAddress",
])

/** Strip Rombo-only fields before forwarding JSON to Uniswap Trading API. */
export function stripTradingRequestMeta<T extends Record<string, unknown>>(body: T): Record<string, unknown> {
  const out = { ...body }
  for (const k of TRADING_REQUEST_META_KEYS) {
    delete out[k]
  }
  return out
}

/**
 * Strip Rombo-only fields before forwarding to Uniswap **Liquidity** API.
 * Keeps `walletAddress` — required on `/lp/create` and related endpoints.
 */
export function stripLiquidityRequestMeta<T extends Record<string, unknown>>(body: T): Record<string, unknown> {
  const out = { ...body }
  for (const k of ROMBO_ONLY_REQUEST_META_KEYS) {
    delete out[k]
  }
  return out
}
