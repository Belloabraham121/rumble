import { NextResponse } from "next/server"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { agentDocToAgent, listAgentsForUser } from "@/lib/db/agents.repo"
import { computeOverviewMetrics } from "@/lib/dashboard/overview-metrics"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

/**
 * Dashboard KPI plates — aggregates persisted agents for the signed-in user (Mongo).
 * Does not read browser storage; clients should sync agents via `PUT /api/agents/sync` first.
 */
export async function GET() {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json(
      { error: "MongoDB is not configured.", metrics: null },
      { status: 503 },
    )
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const docs = await listAgentsForUser(identity.romboUserIdHex)
  const agents = docs.map(agentDocToAgent)
  const metrics = computeOverviewMetrics(agents)

  return NextResponse.json({
    metrics,
    updatedAt: new Date().toISOString(),
    source: "mongo" as const,
  })
}
