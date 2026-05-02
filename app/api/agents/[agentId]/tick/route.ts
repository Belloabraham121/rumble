import { NextResponse } from "next/server"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import {
  findAgentByAgentId,
  findAgentForUser,
  type AgentDoc,
} from "@/lib/db/agents.repo"
import { runAgentTick } from "@/lib/agents/runtime/tick"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

async function resolveAgentDoc(req: Request, agentId: string): Promise<AgentDoc | "unauthorized" | null> {
  if (isCronRequestAuthorized(req)) {
    return findAgentByAgentId(agentId)
  }
  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) return "unauthorized"
  return findAgentForUser(identity.rumbleUserIdHex, agentId)
}

async function handle(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const { agentId } = await ctx.params
  const resolved = await resolveAgentDoc(req, agentId)

  if (resolved === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await runAgentTick(resolved)
  return NextResponse.json({ ok: true, agentId, ...result })
}

export const POST = handle
export const GET = handle
