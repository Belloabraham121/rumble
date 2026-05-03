import "server-only"

import { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type AgentRunDecision =
  | "skip"
  | "swap"
  | "lp_increase"
  | "lp_decrease"
  | "error"

export type AgentRunDoc = {
  _id: ObjectId
  romboUserIdHex: string
  agentId: string
  arenaPoolId?: string
  /** Set when the run targeted a user-registered lab pool (mutually exclusive with `arenaPoolId`). */
  labPoolId?: string
  decision: AgentRunDecision
  summary: string
  detail?: Record<string, unknown>
  idempotencyKey?: string
  txHash?: string
  chainId?: number
  createdAt: Date
}

export type InsertAgentRunInput = Omit<AgentRunDoc, "_id" | "createdAt">

let ensuredIndexes = false

async function ensureAgentRunIndexes(): Promise<void> {
  if (ensuredIndexes) return
  const db = await getMongoDb()
  if (!db) return
  try {
    await db.collection(COLLECTIONS.agentRuns).createIndex({ agentId: 1, createdAt: -1 }, { name: "agent_created" })
    await db.collection(COLLECTIONS.agentRuns).createIndex({ romboUserIdHex: 1, createdAt: -1 }, { name: "user_created" })
    ensuredIndexes = true
  } catch {
    // ignore duplicate index names
  }
}

export async function insertAgentRun(input: InsertAgentRunInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return
  await ensureAgentRunIndexes()
  await db.collection(COLLECTIONS.agentRuns).insertOne({
    ...input,
    createdAt: new Date(),
  })
}

/** Runs with `createdAt` strictly after `since`, oldest → newest (for incremental polling). */
export async function listAgentRunsAfter(input: {
  agentId: string
  romboUserIdHex: string
  since: Date
  limit?: number
}): Promise<AgentRunDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  await ensureAgentRunIndexes()

  const lim = Math.min(Math.max(input.limit ?? 60, 1), 120)
  const filter: Record<string, unknown> = {
    agentId: input.agentId,
    romboUserIdHex: input.romboUserIdHex,
    createdAt: { $gt: input.since },
  }

  const rows = await db
    .collection(COLLECTIONS.agentRuns)
    .find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(lim)
    .toArray()

  return rows as AgentRunDoc[]
}

export async function listAgentRuns(input: {
  agentId: string
  romboUserIdHex?: string
  limit?: number
}): Promise<AgentRunDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  await ensureAgentRunIndexes()

  const lim = Math.min(Math.max(input.limit ?? 40, 1), 200)
  const filter: Record<string, unknown> = { agentId: input.agentId }
  if (input.romboUserIdHex) {
    filter.romboUserIdHex = input.romboUserIdHex
  }

  const rows = await db
    .collection(COLLECTIONS.agentRuns)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray()

  return rows as AgentRunDoc[]
}

/** Evaluator skips (`decision: skip`) in range; `since = null` → full history. */
export async function countAgentRunSkipsInRange(input: {
  agentId: string
  romboUserIdHex: string
  since: Date | null
}): Promise<number> {
  const db = await getMongoDb()
  if (!db) return 0
  await ensureAgentRunIndexes()

  const filter: Record<string, unknown> = {
    agentId: input.agentId,
    romboUserIdHex: input.romboUserIdHex,
    decision: "skip",
  }
  if (input.since) {
    filter.createdAt = { $gte: input.since }
  }

  return db.collection(COLLECTIONS.agentRuns).countDocuments(filter)
}

export type AgentRunCursorPayload = { beforeTime: number; beforeId: string }

function encodeAgentRunCursor(run: AgentRunDoc): string {
  const payload: AgentRunCursorPayload = {
    beforeTime: run.createdAt.getTime(),
    beforeId: run._id.toHexString(),
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodeAgentRunCursor(raw: string): AgentRunCursorPayload | null {
  try {
    const j = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as AgentRunCursorPayload
    if (typeof j.beforeTime !== "number" || typeof j.beforeId !== "string") return null
    return j
  } catch {
    return null
  }
}

/**
 * Newest-first internal fetch, returned **oldest → newest** for execution-log UI.
 * `cursor` loads runs older than the encoded boundary (infinite scroll “past”).
 */
export async function listAgentRunsAscendingPage(input: {
  agentId: string
  romboUserIdHex: string
  limit: number
  cursor?: string
}): Promise<{ runs: AgentRunDoc[]; nextCursor: string | null }> {
  const db = await getMongoDb()
  if (!db) return { runs: [], nextCursor: null }
  await ensureAgentRunIndexes()

  const lim = Math.min(Math.max(input.limit, 1), 120)
  const base: Record<string, unknown> = {
    agentId: input.agentId,
    romboUserIdHex: input.romboUserIdHex,
  }

  const decoded = input.cursor ? decodeAgentRunCursor(input.cursor) : null
  if (decoded) {
    const oid = ObjectId.createFromHexString(decoded.beforeId)
    const dt = new Date(decoded.beforeTime)
    base.$or = [
      { createdAt: { $lt: dt } },
      { createdAt: dt, _id: { $lt: oid } },
    ]
  }

  const rows = await db
    .collection(COLLECTIONS.agentRuns)
    .find(base)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim)
    .toArray()

  const desc = rows as AgentRunDoc[]
  const asc = desc.slice().reverse()
  const nextCursor =
    desc.length === lim && asc.length > 0 ? encodeAgentRunCursor(asc[0]!) : null

  return { runs: asc, nextCursor }
}

/** Ledger merge — newest first. */
export async function listAgentRunsForUserLedger(input: {
  romboUserIdHex: string
  agentId?: string
  limit: number
}): Promise<AgentRunDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  await ensureAgentRunIndexes()

  const lim = Math.min(Math.max(input.limit, 1), 250)
  const filter: Record<string, unknown> = { romboUserIdHex: input.romboUserIdHex }
  if (input.agentId) {
    filter.agentId = input.agentId
  }

  const rows = await db
    .collection(COLLECTIONS.agentRuns)
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim)
    .toArray()

  return rows as AgentRunDoc[]
}
