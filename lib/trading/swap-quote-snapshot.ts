import type { PriceSymbol } from "@/lib/trading/token-meta"

/** Persisted on swap attempts — PnL v1 (`lib/agents/swap-pnl-v1.ts`). */
export type SwapQuoteSnapshot = {
  chainId: number
  amountInRaw: string
  amountOutRaw: string
  tokenIn: string
  tokenOut: string
  tokenInDecimals: number
  tokenOutDecimals: number
  symbolIn: PriceSymbol
  symbolOut: PriceSymbol
  evaluatedAtMs: number
}
