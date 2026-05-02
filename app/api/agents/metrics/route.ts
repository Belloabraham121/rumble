import { NextResponse } from "next/server"
import { computeAgentsMetricsBatch, parseMetricsRange } from "@/lib/agents/metrics"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let range = parseMetricsRange(null)
  let idsRaw = ""
  try {
    const u = new URL(req.url)
    range = parseMetricsRange(u.searchParams.get("range"))
    idsRaw = u.searchParams.get("ids") ?? ""
  } catch {
    // ignore
  }

  const agentIds = idsRaw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 48)

  if (agentIds.length === 0) {
    return NextResponse.json({ metrics: {} as Record<string, unknown> })
  }

  const metrics = await computeAgentsMetricsBatch({
    rumbleUserIdHex: identity.rumbleUserIdHex,
    agentIds,
    range,
  })

  return NextResponse.json({ metrics })
}
