import { getPoolChartSim, type ArenaPoolId } from "@/lib/agents/arena-pools"

/** Map live USD display price to the same coordinate space as dashboard price boxes. */
export function chartCoordFromUsd(usd: number, arenaPoolId: ArenaPoolId): number {
  const s = getPoolChartSim(arenaPoolId)
  const midUsd = s.usdFromSim(s.mid)
  const step = s.usdFromSim(s.mid + 1) - s.usdFromSim(s.mid)
  if (!Number.isFinite(step) || step === 0) return s.mid
  return s.mid + (usd - midUsd) / step
}
