import assert from "node:assert"
import { describe, it } from "node:test"
import { tryBuildSwapQuoteSnapshot } from "./swap-quote-amounts"

describe("swap-quote-amounts", () => {
  it("extracts amounts from nested quoteGasAdjustedOutputAmount", () => {
    const quoteBody = {
      type: "EXACT_INPUT",
      amount: "1000000",
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
      tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenOut: "0x4200000000000000000000000000000000000006",
      swapper: "0xabc",
      routingPreference: "BEST_PRICE",
      urgency: "urgent",
    }

    const quoteResponse = {
      quote: {
        quoteGasAdjustedOutputAmount: "250000000000000",
      },
      requestId: "test-req",
    }

    const snap = tryBuildSwapQuoteSnapshot({
      quoteBody,
      quoteResponse,
      chainId: 8453,
      evaluatedAtMs: 1_700_000_000_000,
    })

    assert.ok(snap)
    assert.strictEqual(snap!.amountInRaw, "1000000")
    assert.strictEqual(snap!.amountOutRaw, "250000000000000")
    assert.strictEqual(snap!.symbolIn, "USDC")
    assert.strictEqual(snap!.symbolOut, "ETH")
  })

  it("returns null when output amount missing", () => {
    const quoteBody = {
      amount: "1000000",
      tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenOut: "0x4200000000000000000000000000000000000006",
    }
    const snap = tryBuildSwapQuoteSnapshot({
      quoteBody,
      quoteResponse: { quote: {} },
      chainId: 8453,
      evaluatedAtMs: Date.now(),
    })
    assert.strictEqual(snap, null)
  })
})
