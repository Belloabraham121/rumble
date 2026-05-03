import type { Agent } from "@/lib/agents/agent-types"
import { legacySimulatorEthPnlToUsd } from "@/lib/dashboard/legacy-simulator-pnl"

/** Aggregates for dashboard KPI plates — API uses Mongo metrics; local fallback uses legacy `totals`. */
export type DashboardOverviewMetrics = {
  agentCount: number
  runningCount: number
  /** Sum of net PnL (USD) — gas vs swap (see `lib/agents/metrics.ts`). */
  totalNetPnlUsd: number
  totalGasUsd: number
  totalFills: number
  totalSkips: number
  /** Successful Trading API calls (`status=ok`, execution kinds). */
  totalActions: number
  /** 0–1 — fills / (fills + skips). */
  winRate: number
}

export function computeOverviewMetrics(agents: Pick<Agent, "status" | "totals">[]): DashboardOverviewMetrics {
  const agentCount = agents.length
  const runningCount = agents.filter(a => a.status === "running").length
  let totalNetPnlUsd = 0
  let totalFills = 0
  let totalSkips = 0

  for (const a of agents) {
    totalNetPnlUsd += legacySimulatorEthPnlToUsd(a.totals.pnlEth)
    totalFills += a.totals.fills
    totalSkips += a.totals.skips
  }

  const totalActions = totalFills + totalSkips
  const wrDenom = totalFills + totalSkips
  const winRate = wrDenom > 0 ? totalFills / wrDenom : 0

  return {
    agentCount,
    runningCount,
    totalNetPnlUsd,
    totalGasUsd: 0,
    totalFills,
    totalSkips,
    totalActions,
    winRate,
  }
}
