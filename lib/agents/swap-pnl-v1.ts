/**
 * PnL v1 — realised swap leg (USD) from quoted amounts at reference prices.
 * `netPnlUsd ≈ swapPnlUsd − gasUsd` in `lib/agents/metrics.ts`.
 */

export function rawTokenAmountToHuman(raw: string, decimals: number): number {
  const v = BigInt(raw)
  let scale = BigInt(1)
  for (let i = 0; i < decimals; i++) {
    scale *= BigInt(10)
  }
  return Number(v) / Number(scale)
}

/**
 * Σ (`amountOut × priceOut` − `amountIn × priceIn`) for one fill — prices are USD per 1 token.
 */
export function computeSwapLegPnlUsdV1(input: {
  amountInRaw: string
  amountOutRaw: string
  tokenInDecimals: number
  tokenOutDecimals: number
  priceInUsd: number
  priceOutUsd: number
}): number {
  const humanIn = rawTokenAmountToHuman(input.amountInRaw, input.tokenInDecimals)
  const humanOut = rawTokenAmountToHuman(input.amountOutRaw, input.tokenOutDecimals)
  return humanOut * input.priceOutUsd - humanIn * input.priceInUsd
}
