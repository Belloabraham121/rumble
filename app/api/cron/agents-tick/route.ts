import { NextResponse } from "next/server"
import { listRunningAgents } from "@/lib/db/agents.repo"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import { runAgentTick } from "@/lib/agents/runtime/tick"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

async function run(req: Request) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const agents = await listRunningAgents()
  const results: Array<{ agentId: string; outcomes: unknown }> = []

  for (const doc of agents) {
    const out = await runAgentTick(doc)
    results.push({ agentId: doc.agentId, outcomes: out.outcomes })
  }

  return NextResponse.json({
    ok: true,
    agents: results.length,
    results,
    ranAt: new Date().toISOString(),
  })
}

export const GET = run
export const POST = run
