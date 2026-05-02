/**
 * Client-side throttle for Uniswap API calls (default platform limit ~6 RPS per key).
 * Stay slightly under to reduce 429s: https://developers.uniswap.org/docs/trading/swapping-api/common-errors
 */

/** Default max requests per second we emit toward Uniswap (leave headroom under 6 RPS). */
export const DEFAULT_UNISWAP_MAX_RPS = 5

export type UniswapRateLimiter = {
  /** Wait until a slot is available, then resolve (FIFO). */
  acquire(): Promise<void>
}

/**
 * Serializes calls with minimum spacing so average rate stays ≤ maxRps.
 * Safe for concurrent callers on one Node process.
 */
export function createUniswapRateLimiter(maxRps: number = DEFAULT_UNISWAP_MAX_RPS): UniswapRateLimiter {
  const minSpacingMs = Math.ceil(1000 / Math.max(1, maxRps))
  let tail: Promise<void> = Promise.resolve()

  return {
    acquire() {
      const run = tail.then(
        () =>
          new Promise<void>(resolve => {
            setTimeout(resolve, minSpacingMs)
          }),
      )
      tail = run.catch(() => {})
      return run
    },
  }
}
