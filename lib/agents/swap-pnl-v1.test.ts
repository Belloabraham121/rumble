import assert from "node:assert"
import { describe, it } from "node:test"
import { computeSwapLegPnlUsdV1, rawTokenAmountToHuman } from "./swap-pnl-v1"

describe("swap-pnl-v1", () => {
  it("rawTokenAmountToHuman converts USDC (6 decimals)", () => {
    assert.strictEqual(rawTokenAmountToHuman("1500000", 6), 1.5)
  })

  it("computeSwapLegPnlUsdV1 matches amountOut×priceOut − amountIn×priceIn", () => {
    // 1 USDC in @ $1, 0.00025 ETH out @ $4000 → 1 - 1 = 0 before fees
    const pnl = computeSwapLegPnlUsdV1({
      amountInRaw: "1000000",
      amountOutRaw: "250000000000000",
      tokenInDecimals: 6,
      tokenOutDecimals: 18,
      priceInUsd: 1,
      priceOutUsd: 4000,
    })
    const humanIn = 1
    const humanOut = 0.00025
    assert.strictEqual(pnl, humanOut * 4000 - humanIn * 1)
    assert.ok(Math.abs(pnl - 0) < 1e-9)
  })

  it("positive leg when output USD value exceeds input", () => {
    const pnl = computeSwapLegPnlUsdV1({
      amountInRaw: "1000000",
      amountOutRaw: "500000000000000",
      tokenInDecimals: 6,
      tokenOutDecimals: 18,
      priceInUsd: 1,
      priceOutUsd: 4000,
    })
    const humanOut = 0.0005
    assert.strictEqual(pnl, humanOut * 4000 - 1)
    assert.ok(pnl > 0)
  })
})
