/** Official Trading API host — see https://developers.uniswap.org/docs/trading/swapping-api/getting-started */
export const UNISWAP_TRADING_API_BASE = "https://trade-api.gateway.uniswap.org/v1"

/**
 * Default Liquidity provisioning API host (paths like `/lp/create`, `/lp/check_approval`).
 * Override with `UNISWAP_LIQUIDITY_API_BASE` in server env when Uniswap changes routing.
 */
export const DEFAULT_UNISWAP_LIQUIDITY_API_BASE = "https://liquidity.api.uniswap.org"

/** Documented min notionals for UniswapX (USD-equivalent — enforce in product when routing includes UniswapX). */
export const UNISWAPX_MIN_NOTIONAL_USD_MAINNET = 300
export const UNISWAPX_MIN_NOTIONAL_USD_L2 = 1000
