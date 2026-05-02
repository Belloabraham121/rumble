import { NextResponse } from "next/server"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { listAgentRuns } from "@/lib/db/agent-runs.repo"
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
  const agent = await findAgentForUser(identity.romboUserIdHex, agentId)
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let limit = 40
  try {
    const u = new URL(req.url)
    const l = Number.parseInt(u.searchParams.get("limit") ?? "40", 10)
    if (Number.isFinite(l)) limit = l
  } catch {
    // ignore
  }

  const runs = await listAgentRuns({
    agentId,
    romboUserIdHex: identity.romboUserIdHex,
    limit,
  })

  return NextResponse.json({ runs })
}
