import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolChartSim } from "@/lib/agents/arena-pools"

/**
 * Maps Rumble dashboard **chart simulation** coordinates (`low` / `high` on the arena chart)
 * to an approximate **USD** band using the same `usdFromSim` anchor as the live chart.
 *
 * Converting that band into Liquidity API `priceBounds.minPrice` / `maxPrice` requires
 * **token1-per-token0** semantics for the specific pool — use pool spot + `@uniswap/sdk-core`
 * (or API-provided ticks) for production. This helper only bridges **visual boxes → USD estimates**.
 */
export function arenaChartCoordsToUsdBand(
  poolId: ArenaPoolId | string,
  lowCoord: number,
  highCoord: number,
): { minUsd: number; maxUsd: number } {
  const sim = getPoolChartSim(poolId)
  const a = sim.usdFromSim(lowCoord)
  const b = sim.usdFromSim(highCoord)
  return { minUsd: Math.min(a, b), maxUsd: Math.max(a, b) }
}
