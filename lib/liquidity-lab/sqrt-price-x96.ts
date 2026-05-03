/**
 * sqrtPriceX96 = floor(sqrt(amount1/amount0) * 2^96) — same as @uniswap/v3-sdk `encodeSqrtRatioX96`.
 * Liquidity API docs: `new_pool.initial_price` is this Q64.96 integer string (live gateway); YAML may still say “human”.
 */
export function sqrtBigInt(n: bigint): bigint {
  const zero = BigInt(0)
  const two = BigInt(2)
  if (n < zero) {
    throw new Error("sqrt of negative bigint")
  }
  if (n < two) {
    return n
  }
  let x = n
  let y = (x + BigInt(1)) / two
  while (y < x) {
    x = y
    y = (n / x + x) / two
  }
  return x
}

export function encodeSqrtRatioX96(amount1: bigint, amount0: bigint): bigint {
  const zero = BigInt(0)
  const bits192 = BigInt(192)
  if (amount0 <= zero) {
    throw new Error("encodeSqrtRatioX96: amount0 must be positive")
  }
  if (amount1 < zero) {
    throw new Error("encodeSqrtRatioX96: amount1 must be non-negative")
  }
  const ratioX192 = (amount1 << bits192) / amount0
  return sqrtBigInt(ratioX192)
}
