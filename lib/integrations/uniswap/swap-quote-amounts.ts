import type { SwapQuoteSnapshot } from "@/lib/trading/swap-quote-snapshot"
import { inferPriceSymbol, tokenDecimalsForAddress } from "@/lib/trading/token-meta"

const OUTPUT_AMOUNT_KEYS_PREFERRED = [
  "quoteGasAdjustedOutputAmount",
  "aggregatedOutputAmount",
  "outputAmount",
  "amountOut",
  "minimumAmountOut",
  "quoteOutputAmount",
] as const

function isPositiveIntegerString(s: string): boolean {
  return /^\d+$/.test(s) && BigInt(s) > BigInt(0)
}

function coerceAmountString(v: unknown): string | undefined {
  if (typeof v === "string" && isPositiveIntegerString(v)) return v
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v)) return String(v)
  return undefined
}

/** Depth-first search for first plausible raw wei-style integer string under common keys. */
function deepFindOutputAmount(root: unknown, depth = 0): string | undefined {
  if (depth > 14 || root === null || root === undefined) return undefined
  if (typeof root === "object" && !Array.isArray(root)) {
    const o = root as Record<string, unknown>
    for (const k of OUTPUT_AMOUNT_KEYS_PREFERRED) {
      const out = coerceAmountString(o[k])
      if (out) return out
    }
    for (const k of Object.keys(o)) {
      const lk = k.toLowerCase()
      if (
        lk.includes("output") &&
        lk.includes("amount") &&
        !lk.includes("input") &&
        !lk.includes("gasprice")
      ) {
        const out = coerceAmountString(o[k])
        if (out) return out
      }
    }
    for (const v of Object.values(o)) {
      const hit = deepFindOutputAmount(v, depth + 1)
      if (hit) return hit
    }
  }
  if (Array.isArray(root)) {
    for (const x of root) {
      const hit = deepFindOutputAmount(x, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Best-effort parse of EXACT_INPUT quote request + `/quote` JSON for PnL v1.
 * Returns null when output amount cannot be found (metrics fall back to gas-only net).
 */
export function tryBuildSwapQuoteSnapshot(input: {
  quoteBody: Record<string, unknown>
  quoteResponse: unknown
  chainId: number
  evaluatedAtMs: number
}): SwapQuoteSnapshot | null {
  const amountInRaw =
    typeof input.quoteBody.amount === "string"
      ? input.quoteBody.amount
      : typeof input.quoteBody.amount === "number"
        ? String(Math.floor(input.quoteBody.amount))
        : undefined

  const tokenIn =
    typeof input.quoteBody.tokenIn === "string" ? input.quoteBody.tokenIn.trim().toLowerCase() : ""
  const tokenOut =
    typeof input.quoteBody.tokenOut === "string" ? input.quoteBody.tokenOut.trim().toLowerCase() : ""

  if (!amountInRaw || !isPositiveIntegerString(amountInRaw) || !tokenIn.startsWith("0x") || !tokenOut.startsWith("0x")) {
    return null
  }

  const quoteNested =
    input.quoteResponse &&
    typeof input.quoteResponse === "object" &&
    "quote" in (input.quoteResponse as object)
      ? (input.quoteResponse as { quote?: unknown }).quote
      : undefined

  const amountOutRaw =
    deepFindOutputAmount(quoteNested) ??
    deepFindOutputAmount(input.quoteResponse) ??
    undefined

  if (!amountOutRaw || !isPositiveIntegerString(amountOutRaw)) return null

  const symIn = inferPriceSymbol(tokenIn)
  const symOut = inferPriceSymbol(tokenOut)
  if (!symIn || !symOut) return null

  return {
    chainId: input.chainId,
    amountInRaw,
    amountOutRaw,
    tokenIn,
    tokenOut,
    tokenInDecimals: tokenDecimalsForAddress(tokenIn),
    tokenOutDecimals: tokenDecimalsForAddress(tokenOut),
    symbolIn: symIn,
    symbolOut: symOut,
    evaluatedAtMs: input.evaluatedAtMs,
  }
}
