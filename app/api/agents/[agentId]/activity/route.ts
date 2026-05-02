import { NextResponse } from "next/server"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { loadAgentActivityEvents } from "@/lib/agents/activity-join"
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

  let limit = 60
  let cursor: string | null = null
  try {
    const u = new URL(req.url)
    const l = Number.parseInt(u.searchParams.get("limit") ?? "60", 10)
    if (Number.isFinite(l)) limit = l
    cursor = u.searchParams.get("cursor")
  } catch {
    // ignore
  }

  const { events, nextCursor } = await loadAgentActivityEvents({
    romboUserIdHex: identity.romboUserIdHex,
    agentId,
    limit,
    cursor,
  })

  return NextResponse.json({ events, nextCursor })
}
