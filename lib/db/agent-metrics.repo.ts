import "server-only"

import type { ObjectId } from "mongodb"
import type { MetricsRange, AgentMetricsSnapshot } from "@/lib/agents/metrics-types"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type AgentMetricsRollupDoc = {
  _id: ObjectId
  romboUserIdHex: string
  agentId: string
  updatedAt: Date
  byRange: Partial<Record<MetricsRange, AgentMetricsSnapshot>>
}

let ensuredIndexes = false

async function ensureIndexes(): Promise<void> {
  if (ensuredIndexes) return
  const db = await getMongoDb()
  if (!db) return
  try {
    await db.collection(COLLECTIONS.agentMetrics).createIndex(
      { romboUserIdHex: 1, agentId: 1 },
      { unique: true, name: "user_agent_metrics" },
    )
    ensuredIndexes = true
  } catch {
    // ignore duplicates
  }
}

export async function findAgentMetricsRollup(
  romboUserIdHex: string,
  agentId: string,
): Promise<AgentMetricsRollupDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  await ensureIndexes()

  const doc = await db.collection(COLLECTIONS.agentMetrics).findOne({
    romboUserIdHex,
    agentId,
  })
  return doc as AgentMetricsRollupDoc | null
}

/** Merge one range into the rollup document (read-through cache warm-up). */
export async function upsertAgentMetricsRange(
  romboUserIdHex: string,
  agentId: string,
  range: MetricsRange,
  snapshot: AgentMetricsSnapshot,
): Promise<void> {
  const db = await getMongoDb()
  if (!db) return
  await ensureIndexes()

  const now = new Date()
  await db.collection(COLLECTIONS.agentMetrics).updateOne(
    { romboUserIdHex, agentId },
    {
      $set: {
        romboUserIdHex,
        agentId,
        [`byRange.${range}`]: snapshot,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}

/** Replace full cache — called after each agent tick to keep reads O(1). */
export async function upsertAgentMetricsRollupFull(input: {
  romboUserIdHex: string
  agentId: string
  byRange: Partial<Record<MetricsRange, AgentMetricsSnapshot>>
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return
  await ensureIndexes()

  const now = new Date()
  await db.collection(COLLECTIONS.agentMetrics).updateOne(
    { romboUserIdHex: input.romboUserIdHex, agentId: input.agentId },
    {
      $set: {
        romboUserIdHex: input.romboUserIdHex,
        agentId: input.agentId,
        byRange: input.byRange,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}
