import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type IndexedPoolSnapshotDoc = {
  _id: ObjectId
  chainId: number
  poolAddress: string
  arenaPoolId?: string
  totalValueLockedUsd?: string
  volumeUsd?: string
  feesUsd?: string
  txCount?: string
  source: "subgraph"
  fetchedAt: Date
}

export type UpsertIndexedPoolSnapshotInput = Omit<IndexedPoolSnapshotDoc, "_id" | "fetchedAt"> & {
  fetchedAt?: Date
}

export async function upsertIndexedPoolSnapshot(input: UpsertIndexedPoolSnapshotInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const addr = input.poolAddress.trim().toLowerCase()
  const now = input.fetchedAt ?? new Date()

  await db.collection(COLLECTIONS.indexedPoolSnapshots).updateOne(
    { chainId: input.chainId, poolAddress: addr },
    {
      $set: {
        ...input,
        poolAddress: addr,
        fetchedAt: now,
      },
    },
    { upsert: true },
  )
}

export async function getLatestIndexedPoolSnapshot(input: {
  chainId: number
  poolAddress: string
}): Promise<IndexedPoolSnapshotDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  const doc = await db.collection(COLLECTIONS.indexedPoolSnapshots).findOne({
    chainId: input.chainId,
    poolAddress: input.poolAddress.trim().toLowerCase(),
  })
  return doc as IndexedPoolSnapshotDoc | null
}
