/**
 * Dashboard displays PnL in USDC. Internal totals stay in ETH; we convert using
 * the same reference ETH/USD anchor as the live chart (`usdFromSim` baseline).
 */
export const ETH_USD_REF_FOR_PNL = 2306.94

export function pnlEthToUsdc(ethPnl: number): number {
  return ethPnl * ETH_USD_REF_FOR_PNL
}

/** Formats signed USDC for metric cards (e.g. +1,234.56 USDC). */
export function formatPnlUsdc(ethPnl: number, fractionDigits = 2): string {
  const usdc = pnlEthToUsdc(ethPnl)
  const sign = usdc > 0 ? "+" : usdc < 0 ? "−" : ""
  const n = Math.abs(usdc)
  const num = n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  return `${sign}${num} USDC`
}

/** Signed integer USDC (no suffix) — for dense tables where the column header says USDC. */
export function formatSignedUsdcIntegerFromEthPnl(ethPnl: number): string {
  const usdc = pnlEthToUsdc(ethPnl)
  const sign = usdc > 0 ? "+" : usdc < 0 ? "−" : ""
  const n = Math.abs(usdc)
  return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
