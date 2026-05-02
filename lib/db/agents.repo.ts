import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { migrateAgentConfig, type Agent } from "@/lib/agents/agent-types"
import type { RumbleChainSlug } from "@/lib/rumble/chain-config"

export type AgentDoc = {
  _id: ObjectId
  rumbleUserIdHex: string
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
    config: migrateAgentConfig(doc.config as Record<string, unknown>),
    boxes: doc.boxes,
    totals: doc.totals,
    activity: doc.activity,
  }
}

export async function listAgentsForUser(rumbleUserIdHex: string): Promise<AgentDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const cur = db
    .collection(COLLECTIONS.agents)
    .find({ rumbleUserIdHex })
    .sort({ updatedAt: -1 })

  const rows = await cur.toArray()
  return rows as AgentDoc[]
}

/** Lookup by dashboard agent id (unique per deployment). */
export async function findAgentByAgentId(agentId: string): Promise<AgentDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  const doc = await db.collection(COLLECTIONS.agents).findOne({ agentId })
  return doc as AgentDoc | null
}

export async function findAgentForUser(
  rumbleUserIdHex: string,
  agentId: string,
): Promise<AgentDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  const doc = await db.collection(COLLECTIONS.agents).findOne({ rumbleUserIdHex, agentId })
  return doc as AgentDoc | null
}

/** Full upsert — replaces config/boxes/totals/activity for this agent id. */
export async function upsertAgentForUser(input: {
  rumbleUserIdHex: string
  agent: Agent
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  const a = input.agent

  await db.collection(COLLECTIONS.agents).updateOne(
    { rumbleUserIdHex: input.rumbleUserIdHex, agentId: a.id },
    {
      $set: {
        rumbleUserIdHex: input.rumbleUserIdHex,
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
  rumbleUserIdHex: string
  agentId: string
}): Promise<boolean> {
  const db = await getMongoDb()
  if (!db) return false

  const res = await db.collection(COLLECTIONS.agents).deleteOne({
    rumbleUserIdHex: input.rumbleUserIdHex,
    agentId: input.agentId,
  })
  return res.deletedCount > 0
}

export async function upsertManyAgentsForUser(input: {
  rumbleUserIdHex: string
  agents: Agent[]
}): Promise<void> {
  for (const agent of input.agents) {
    await upsertAgentForUser({ rumbleUserIdHex: input.rumbleUserIdHex, agent })
  }
}

/** All agents marked running — used by cron ticks. */
export async function listRunningAgents(): Promise<AgentDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const rows = await db.collection(COLLECTIONS.agents).find({ status: "running" }).toArray()
  return rows as AgentDoc[]
}

/** Agents whose config allows trading `arenaPoolId` on `chainSlug` (arena leaderboard). */
export async function listAgentsForArenaLeaderboard(input: {
  chainSlug: RumbleChainSlug
  arenaPoolId: ArenaPoolId
}): Promise<AgentDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const rows = await db
    .collection(COLLECTIONS.agents)
    .find({
      "config.chain": input.chainSlug,
      $or: [{ "config.tradeAllPools": true }, { "config.enabledPoolIds": input.arenaPoolId }],
    })
    .toArray()

  return rows as AgentDoc[]
}
