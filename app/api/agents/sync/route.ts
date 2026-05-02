import { NextResponse } from "next/server"
import { findAgentForUser, upsertManyAgentsForUser } from "@/lib/db/agents.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import type { Agent } from "@/lib/agents/agent-types"
import { prepareAgentForUpsert } from "@/lib/agents/runtime/validate-config"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

function isAgent(v: unknown): v is Agent {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "number" &&
    o.config !== undefined &&
    typeof o.config === "object" &&
    Array.isArray(o.boxes) &&
    typeof o.totals === "object" &&
    Array.isArray(o.activity) &&
    (o.status === "running" || o.status === "paused")
  )
}

/** Bulk upsert — dashboard client pushes full agent state (debounced). */
export async function PUT(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 })
  }

  const agentsRaw = (body as Record<string, unknown>).agents
  if (!Array.isArray(agentsRaw) || agentsRaw.length === 0) {
    return NextResponse.json({ error: "Expected non-empty agents array" }, { status: 400 })
  }

  const agents: Agent[] = []
  for (const a of agentsRaw) {
    if (!isAgent(a)) {
      return NextResponse.json({ error: "Invalid agent object in array" }, { status: 400 })
    }
    try {
      const prev = await findAgentForUser(identity.rumbleUserIdHex, a.id)
      agents.push(prepareAgentForUpsert(a, prev?.config))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  await upsertManyAgentsForUser({
    rumbleUserIdHex: identity.rumbleUserIdHex,
    agents,
  })

  return NextResponse.json({ ok: true, count: agents.length })
}
