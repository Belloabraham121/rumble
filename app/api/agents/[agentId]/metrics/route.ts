import { NextResponse } from "next/server"
import { parseMetricsRange, resolveAgentMetricsForApi } from "@/lib/agents/metrics"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

export async function GET(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { agentId } = await ctx.params
  let range = parseMetricsRange(null)
  try {
    const u = new URL(req.url)
    range = parseMetricsRange(u.searchParams.get("range"))
  } catch {
    // ignore
  }

  const metrics = await resolveAgentMetricsForApi({
    romboUserIdHex: identity.romboUserIdHex,
    agentId,
    range,
  })

  if (!metrics) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ metrics })
}
