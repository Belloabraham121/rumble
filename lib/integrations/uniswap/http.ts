import "server-only"

import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import {
  classifyUniswapHttpFailure,
  classifyUniswapNetworkFailure,
  RumbleUniswapError,
  UNISWAP_ERROR_CODES,
} from "./errors"
import { createUniswapRateLimiter, DEFAULT_UNISWAP_MAX_RPS } from "./rate-limiter"

const defaultLimiter = createUniswapRateLimiter(DEFAULT_UNISWAP_MAX_RPS)

export type FetchUniswapOptions = RequestInit & {
  /** Override default ~5 RPS limiter for tests or dedicated workers */
  limiter?: { acquire(): Promise<void> }
}

/**
 * Authenticated fetch toward Uniswap Labs APIs with per-process rate shaping and stable errors.
 * Used for **Trading** (`trade-api.gateway.uniswap.org`) and **Liquidity** (`liquidity.api.uniswap.org`) —
 * they share the same API key and process-local ~5 RPS limiter (budget ~6 RPS per key).
 * Requires `UNISWAP_API_KEY` (throws `RumbleUniswapError` `UNISWAP_MISSING_API_KEY` before network if unset).
 */
export async function fetchUniswap(input: RequestInfo | URL, init?: FetchUniswapOptions): Promise<Response> {
  const env = getRumbleServerEnv()
  if (!env.uniswapApiKey) {
    throw new RumbleUniswapError(
      UNISWAP_ERROR_CODES.MISSING_API_KEY,
      "UNISWAP_API_KEY is not configured — set it in server env.",
    )
  }

  const { limiter: overrideLimiter, ...fetchInit } = init ?? {}
  const headers = new Headers(fetchInit.headers)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (!headers.has("Content-Type") && fetchInit.method && fetchInit.method !== "GET" && fetchInit.method !== "HEAD") {
    headers.set("Content-Type", "application/json")
  }
  if (!headers.has("x-api-key")) headers.set("x-api-key", env.uniswapApiKey)

  const limiter = overrideLimiter ?? defaultLimiter
  await limiter.acquire()

  try {
    return await fetch(input, { ...fetchInit, headers })
  } catch (e) {
    throw classifyUniswapNetworkFailure(e)
  }
}

/** Read response text and throw `RumbleUniswapError` when HTTP status is not ok. */
export async function readUniswapJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!res.ok) {
    throw classifyUniswapHttpFailure({ httpStatus: res.status, bodyText: text })
  }
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new RumbleUniswapError(
      UNISWAP_ERROR_CODES.UNKNOWN,
      "Uniswap API returned non-JSON success body.",
      { httpStatus: res.status },
    )
  }
}
