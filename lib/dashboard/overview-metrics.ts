import type { Agent } from "@/lib/agents/agent-types"

/** Aggregates for dashboard KPI plates — same math client + server. */
export type DashboardOverviewMetrics = {
  agentCount: number
  runningCount: number
  /** Sum of `totals.pnlEth` (ETH-style simulator units → USDC display via `formatPnlUsdc`). */
  totalPnlEth: number
  totalFills: number
  totalSkips: number
  totalActions: number
  /** 0–1 */
  winRate: number
}

export function computeOverviewMetrics(agents: Pick<Agent, "status" | "totals">[]): DashboardOverviewMetrics {
  const agentCount = agents.length
  const runningCount = agents.filter(a => a.status === "running").length
  let totalPnlEth = 0
  let totalFills = 0
  let totalSkips = 0

  for (const a of agents) {
    totalPnlEth += a.totals.pnlEth
    totalFills += a.totals.fills
    totalSkips += a.totals.skips
  }

  const totalActions = totalFills + totalSkips
  const winRate = totalActions > 0 ? totalFills / totalActions : 0

  return {
    agentCount,
    runningCount,
    totalPnlEth,
    totalFills,
    totalSkips,
    totalActions,
    winRate,
  }
}
