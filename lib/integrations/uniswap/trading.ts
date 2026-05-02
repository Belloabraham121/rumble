import "server-only"

import { getRomboServerEnv } from "@/lib/rombo/server-env"
import { UNISWAP_TRADING_API_BASE } from "@/lib/integrations/uniswap/constants"
import { fetchUniswap, readUniswapJsonOrThrow } from "@/lib/integrations/uniswap/http"

export type UniswapTradingHeaders = {
  /** Forward Permit2 off when using direct approve-then-swap. */
  permit2Disabled?: boolean
  /** UniswapX native ETH input path — must match quote. */
  erc20EthEnabled?: boolean
}

function mergeTradingHeaders(base: Headers, extra?: UniswapTradingHeaders): Headers {
  const h = new Headers(base)
  const env = getRomboServerEnv()
  h.set("x-universal-router-version", env.uniswapUniversalRouterVersion)
  if (extra?.permit2Disabled) {
    h.set("x-permit2-disabled", "true")
  }
  if (extra?.erc20EthEnabled) {
    h.set("x-erc20eth-enabled", "true")
  }
  return h
}

/** POST /v1/check_approval — https://developers.uniswap.org/docs/api-reference/check_approval */
export async function uniswapCheckApproval(
  body: Record<string, unknown>,
  headers?: UniswapTradingHeaders,
): Promise<unknown> {
  const initHeaders = mergeTradingHeaders(new Headers(), headers)
  const res = await fetchUniswap(`${UNISWAP_TRADING_API_BASE}/check_approval`, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify(body),
  })
  return readUniswapJsonOrThrow(res)
}

/** POST /v1/quote — https://developers.uniswap.org/docs/api-reference/aggregator_quote */
export async function uniswapQuote(
  body: Record<string, unknown>,
  headers?: UniswapTradingHeaders,
): Promise<unknown> {
  const initHeaders = mergeTradingHeaders(new Headers(), headers)
  const res = await fetchUniswap(`${UNISWAP_TRADING_API_BASE}/quote`, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify(body),
  })
  return readUniswapJsonOrThrow(res)
}

/** POST /v1/swap — https://developers.uniswap.org/docs/api-reference/create_swap_transaction */
export async function uniswapCreateSwap(
  body: Record<string, unknown>,
  headers?: UniswapTradingHeaders,
): Promise<unknown> {
  const initHeaders = mergeTradingHeaders(new Headers(), headers)
  const res = await fetchUniswap(`${UNISWAP_TRADING_API_BASE}/swap`, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify(body),
  })
  return readUniswapJsonOrThrow(res)
}

/** POST /v1/order — https://developers.uniswap.org/docs/api-reference/post_order */
export async function uniswapPostOrder(
  body: Record<string, unknown>,
  headers?: UniswapTradingHeaders,
): Promise<unknown> {
  const initHeaders = mergeTradingHeaders(new Headers(), headers)
  const res = await fetchUniswap(`${UNISWAP_TRADING_API_BASE}/order`, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify(body),
  })
  return readUniswapJsonOrThrow(res)
}

export function tryGetRequestId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const id = (body as { requestId?: unknown }).requestId
  return typeof id === "string" ? id : undefined
}
