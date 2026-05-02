import { NextResponse } from "next/server"
import {
  agentDocToAgent,
  listAgentsForUser,
  upsertAgentForUser,
} from "@/lib/db/agents.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import type { Agent, AgentConfig } from "@/lib/agents/agent-types"
import { migrateAgentConfig, DEFAULT_AGENT_CONFIG, DEFAULT_RUNTIME_BOXES } from "@/lib/agents/agent-types"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

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

/** List persisted agents for the signed-in Rombo user. */
export async function GET() {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured.", agents: [] }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const docs = await listAgentsForUser(identity.romboUserIdHex)
  const agents = docs.map(agentDocToAgent)
  return NextResponse.json({ agents })
}

/**
 * Create or replace a single agent row (`agent` must include stable `id` for wallet linkage).
 */
export async function POST(req: Request) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
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
    await upsertAgentForUser({
      romboUserIdHex: identity.romboUserIdHex,
      agent: raw.agent,
    })
    return NextResponse.json({ ok: true, agent: raw.agent })
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

  await upsertAgentForUser({ romboUserIdHex: identity.romboUserIdHex, agent })
  return NextResponse.json({ ok: true, agent }, { status: 201 })
}
