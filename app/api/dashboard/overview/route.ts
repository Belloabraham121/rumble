import { NextResponse } from "next/server"
import { computeDashboardOverviewFromDb, parseMetricsRange } from "@/lib/agents/metrics"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

/**
 * Dashboard KPI plates — aggregates trading/agents runs + receipts for the signed-in user.
 * Does not read browser storage; clients should sync agents via `PUT /api/agents/sync` first.
 */
export async function GET(req: Request) {
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

  let range = parseMetricsRange(null)
  try {
    const u = new URL(req.url)
    range = parseMetricsRange(u.searchParams.get("range"))
  } catch {
    // ignore
  }

  const metrics = await computeDashboardOverviewFromDb({
    romboUserIdHex: identity.romboUserIdHex,
    range,
  })

  return NextResponse.json({
    metrics,
    range,
    updatedAt: new Date().toISOString(),
    source: "mongo" as const,
  })
}
