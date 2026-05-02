import { NextResponse } from "next/server"
import {
  agentDocToAgent,
  findAgentForUser,
  listAgentsForUser,
  upsertAgentForUser,
} from "@/lib/db/agents.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import type { Agent, AgentConfig } from "@/lib/agents/agent-types"
import { migrateAgentConfig, DEFAULT_AGENT_CONFIG, DEFAULT_RUNTIME_BOXES } from "@/lib/agents/agent-types"
import { prepareAgentForUpsert } from "@/lib/agents/runtime/validate-config"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

function newAgentId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isAgentLike(v: unknown): v is Agent {
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

/** List persisted agents for the signed-in Rumble user. */
export async function GET() {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured.", agents: [] }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const docs = await listAgentsForUser(identity.rumbleUserIdHex)
  const agents = docs.map(agentDocToAgent)
  return NextResponse.json({ agents })
}

/**
 * Create or replace a single agent row (`agent` must include stable `id` for wallet linkage).
 */
export async function POST(req: Request) {
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

  const raw = body as Record<string, unknown>

  if (raw.agent !== undefined && isAgentLike(raw.agent)) {
    try {
      const prev = await findAgentForUser(identity.rumbleUserIdHex, raw.agent.id)
      const agent = prepareAgentForUpsert(raw.agent, prev?.config)
      await upsertAgentForUser({
        rumbleUserIdHex: identity.rumbleUserIdHex,
        agent,
      })
      return NextResponse.json({ ok: true, agent })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "Provide `agent` (full object) or `name` for server-side defaults." }, { status: 400 })
  }

  const cfgPatch =
    raw.config !== undefined && typeof raw.config === "object" && raw.config !== null
      ? (raw.config as Partial<AgentConfig>)
      : {}

  const cfg = migrateAgentConfig({
    ...DEFAULT_AGENT_CONFIG,
    ...cfgPatch,
    name,
  })

  const agent: Agent = {
    id: newAgentId(),
    status: raw.status === "paused" ? "paused" : "running",
    createdAt: Date.now(),
    config: cfg,
    boxes: DEFAULT_RUNTIME_BOXES.map(b => ({ ...b })),
    totals: { pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 },
    activity: [],
  }

  try {
    const validated = prepareAgentForUpsert(agent, undefined)
    await upsertAgentForUser({ rumbleUserIdHex: identity.rumbleUserIdHex, agent: validated })
    return NextResponse.json({ ok: true, agent: validated }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
