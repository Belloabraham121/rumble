import "server-only"

import type { ObjectId } from "mongodb"
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
