import { NextResponse } from "next/server"
import { agentDocToAgent, deleteAgentForUser, findAgentForUser } from "@/lib/db/agents.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export async function GET(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { agentId } = await ctx.params
  const doc = await findAgentForUser(identity.romboUserIdHex, agentId)
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ agent: agentDocToAgent(doc) })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { agentId } = await ctx.params
  const ok = await deleteAgentForUser({
    romboUserIdHex: identity.romboUserIdHex,
    agentId,
  })

  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
