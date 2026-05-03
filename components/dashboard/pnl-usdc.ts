import { legacySimulatorEthPnlToUsd } from "@/lib/dashboard/legacy-simulator-pnl"

/** Signed USD / USDC display for metric cards (e.g. +1,234.56 USDC). Prefer API `netPnlUsd`. */
export function formatSignedUsd(usd: number, fractionDigits = 2): string {
  const sign = usd > 0 ? "+" : usd < 0 ? "−" : ""
  const n = Math.abs(usd)
  const num = n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  return `${sign}${num} USDC`
}

/** Signed integer USDC (no suffix) — dense tables; value is already USD. */
export function formatSignedUsdInteger(usd: number): string {
  const sign = usd > 0 ? "+" : usd < 0 ? "−" : ""
  const n = Math.abs(usd)
  return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Legacy simulator column — `totals.pnlEth` / activity rows still store ETH-shaped units.
 * Server metrics use USD fields directly (`formatSignedUsd`).
 */
export function formatPnlUsdc(ethSimulatorPnl: number, fractionDigits = 2): string {
  return formatSignedUsd(legacySimulatorEthPnlToUsd(ethSimulatorPnl), fractionDigits)
}

/** Legacy: ETH simulator → rounded integer USDC string. */
export function formatSignedUsdcIntegerFromEthPnl(ethPnl: number): string {
  return formatSignedUsdInteger(legacySimulatorEthPnlToUsd(ethPnl))
}
