import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type AgentWalletDoc = {
  _id: ObjectId
  /** Mongo user id (hex) */
  romboUserId: string
  agentId: string
  chainId: number
  privyWalletId: string
  address?: string
  policyIds?: string[]
  createdAt: Date
  updatedAt: Date
}

export async function findAgentWallet(
  romboUserId: string,
  agentId: string,
): Promise<AgentWalletDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  return db.collection<AgentWalletDoc>(COLLECTIONS.agentWallets).findOne({ romboUserId, agentId })
}

export async function upsertAgentWalletRecord(input: Omit<AgentWalletDoc, "_id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  await db.collection(COLLECTIONS.agentWallets).updateOne(
    { romboUserId: input.romboUserId, agentId: input.agentId },
    {
      $set: {
        ...input,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
}
