import "server-only"

import { RumbleUniswapError, UNISWAP_ERROR_CODES, type UniswapErrorCode } from "@/lib/integrations/uniswap/errors"

const DEFAULT_RETRYABLE: UniswapErrorCode[] = [
  UNISWAP_ERROR_CODES.RATE_LIMITED,
  UNISWAP_ERROR_CODES.SERVER_ERROR,
  UNISWAP_ERROR_CODES.GATEWAY_TIMEOUT,
  UNISWAP_ERROR_CODES.NETWORK,
]

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type UniswapRetryOptions = {
  /** Max attempts including the first try */
  maxAttempts?: number
  /** Initial backoff in ms (exponential, capped) */
  baseDelayMs?: number
  /** Cap single sleep */
  maxDelayMs?: number
  /** Jitter ratio 0–1 applied to delay */
  jitterRatio?: number
  retryOnCodes?: readonly UniswapErrorCode[]
}

/**
 * Retry transient Uniswap failures (429, 5xx, gateway timeout, network).
 * Does **not** retry validation / no-quote errors.
 */
export async function withUniswapRetry<T>(fn: () => Promise<T>, opts?: UniswapRetryOptions): Promise<T> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 4)
  const base = opts?.baseDelayMs ?? 400
  const maxDelay = opts?.maxDelayMs ?? 8000
  const jitterRatio = opts?.jitterRatio ?? 0.15
  const retryOn = new Set(opts?.retryOnCodes ?? DEFAULT_RETRYABLE)

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const retryable =
        e instanceof RumbleUniswapError && retryOn.has(e.code as UniswapErrorCode) && attempt < maxAttempts
      if (!retryable) throw e

      const exp = Math.min(maxDelay, base * 2 ** (attempt - 1))
      const jitter = exp * jitterRatio * (Math.random() * 2 - 1)
      await sleep(Math.max(0, Math.round(exp + jitter)))
    }
  }
  throw lastErr
}
