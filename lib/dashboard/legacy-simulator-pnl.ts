/**
 * Client-side simulator (`AgentTotals.pnlEth`) predates server metrics.
 * Used only as a fallback when Mongo-backed metrics are unavailable.
 */
export const LEGACY_SIMULATOR_ETH_USD_PER_ETH = 2306.94

export function legacySimulatorEthPnlToUsd(ethPnl: number): number {
  return ethPnl * LEGACY_SIMULATOR_ETH_USD_PER_ETH
}
