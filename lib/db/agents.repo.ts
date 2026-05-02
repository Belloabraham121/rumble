import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import type { Agent } from "@/lib/agents/agent-types"

export type AgentDoc = {
  _id: ObjectId
  romboUserIdHex: string
  agentId: string
  status: Agent["status"]
  createdAt: number
  config: Agent["config"]
  boxes: Agent["boxes"]
  totals: Agent["totals"]
  activity: Agent["activity"]
  updatedAt: Date
}

/** Convert persisted doc to client `Agent` shape (`id` ← `agentId`). */
export function agentDocToAgent(doc: AgentDoc): Agent {
  return {
    id: doc.agentId,
    status: doc.status,
    createdAt: doc.createdAt,
    config: doc.config,
    boxes: doc.boxes,
    totals: doc.totals,
    activity: doc.activity,
  }
}

export async function listAgentsForUser(romboUserIdHex: string): Promise<AgentDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const cur = db
    .collection(COLLECTIONS.agents)
    .find({ romboUserIdHex })
    .sort({ updatedAt: -1 })

  const rows = await cur.toArray()
  return rows as AgentDoc[]
}

export async function findAgentForUser(
  romboUserIdHex: string,
  agentId: string,
): Promise<AgentDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  const doc = await db.collection(COLLECTIONS.agents).findOne({ romboUserIdHex, agentId })
  return doc as AgentDoc | null
}

/** Full upsert — replaces config/boxes/totals/activity for this agent id. */
export async function upsertAgentForUser(input: {
  romboUserIdHex: string
  agent: Agent
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  const a = input.agent

  await db.collection(COLLECTIONS.agents).updateOne(
    { romboUserIdHex: input.romboUserIdHex, agentId: a.id },
    {
      $set: {
        romboUserIdHex: input.romboUserIdHex,
        agentId: a.id,
        status: a.status,
        createdAt: a.createdAt,
        config: a.config,
        boxes: a.boxes,
        totals: a.totals,
        activity: a.activity,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}

export async function deleteAgentForUser(input: {
  romboUserIdHex: string
  agentId: string
}): Promise<boolean> {
  const db = await getMongoDb()
  if (!db) return false

  const res = await db.collection(COLLECTIONS.agents).deleteOne({
    romboUserIdHex: input.romboUserIdHex,
    agentId: input.agentId,
  })
  return res.deletedCount > 0
}

export async function upsertManyAgentsForUser(input: {
  romboUserIdHex: string
  agents: Agent[]
}): Promise<void> {
  for (const agent of input.agents) {
    await upsertAgentForUser({ romboUserIdHex: input.romboUserIdHex, agent })
  }
}
