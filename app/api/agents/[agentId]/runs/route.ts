import { NextResponse } from "next/server"
import { agentRunToPublic } from "@/lib/agents/agent-run-public"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { listAgentRuns, listAgentRunsAfter } from "@/lib/db/agent-runs.repo"
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
  let since: Date | null = null
  try {
    const u = new URL(req.url)
    const l = Number.parseInt(u.searchParams.get("limit") ?? "40", 10)
    if (Number.isFinite(l)) limit = l
    const sinceRaw = u.searchParams.get("since")
    if (sinceRaw) {
      const d = new Date(sinceRaw)
      if (!Number.isNaN(d.getTime())) since = d
    }
  } catch {
    // ignore
  }

  const docs =
    since !== null
      ? await listAgentRunsAfter({
          agentId,
          romboUserIdHex: identity.romboUserIdHex,
          since,
          limit,
        })
      : await listAgentRuns({
          agentId,
          romboUserIdHex: identity.romboUserIdHex,
          limit,
        })

  const runs = docs.map(agentRunToPublic)

  return NextResponse.json({ runs })
}
