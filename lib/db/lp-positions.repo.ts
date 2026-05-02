import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type LpPositionDoc = {
  _id: ObjectId
  rumbleUserIdHex?: string
  agentId: string
  arenaPoolId?: string
  chainId: number
  protocol?: string
  nftTokenId: string
  token0Address?: string
  token1Address?: string
  poolReference?: string
  updatedAt: Date
}

export type UpsertLpPositionInput = Omit<LpPositionDoc, "_id" | "updatedAt">

export async function upsertLpPositionByAgentPool(input: UpsertLpPositionInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  /** Prefer arena-scoped row when `arenaPoolId` is present; otherwise key by NFT id. */
  const filter =
    input.arenaPoolId !== undefined
      ? { agentId: input.agentId, chainId: input.chainId, arenaPoolId: input.arenaPoolId }
      : { agentId: input.agentId, chainId: input.chainId, nftTokenId: input.nftTokenId }

  await db.collection(COLLECTIONS.lpPositions).updateOne(
    filter,
    {
      $set: {
        ...input,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}

export async function findLpPositionForAgentPool(input: {
  agentId: string
  chainId: number
  arenaPoolId?: string
}): Promise<LpPositionDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  const doc = await db.collection(COLLECTIONS.lpPositions).findOne({
    agentId: input.agentId,
    chainId: input.chainId,
    ...(input.arenaPoolId ? { arenaPoolId: input.arenaPoolId } : {}),
  })
  return doc as LpPositionDoc | null
}
