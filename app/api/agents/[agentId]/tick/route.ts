import { NextResponse } from "next/server"
import { findAgentByAgentId } from "@/lib/db/agents.repo"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import { runAgentTick } from "@/lib/agents/runtime/tick"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

async function handle(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const { agentId } = await ctx.params
  const doc = await findAgentByAgentId(agentId)
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await runAgentTick(doc)
  return NextResponse.json({ ok: true, agentId, ...result })
}

export const POST = handle
export const GET = handle
