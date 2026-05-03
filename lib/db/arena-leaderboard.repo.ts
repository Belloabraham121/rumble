import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import type { ArenaLeaderboardEntry } from "@/lib/arena/types"

export type ArenaLeaderboardCacheDoc = {
  _id: ObjectId
  arenaPoolId: string
  chainId: number
  /** Matches metrics window e.g. `30d`. */
  rangeKey: string
  updatedAt: Date
  entries: ArenaLeaderboardEntry[]
}

let ensuredIndexes = false

async function ensureIndexes(): Promise<void> {
  if (ensuredIndexes) return
  const db = await getMongoDb()
  if (!db) return
  try {
    await db.collection(COLLECTIONS.arenaLeaderboardCache).createIndex(
      { arenaPoolId: 1, chainId: 1, rangeKey: 1 },
      { unique: true, name: "arena_pool_chain_range" },
    )
    ensuredIndexes = true
  } catch {
    // ignore duplicate
  }
}

export async function findArenaLeaderboardCache(input: {
  arenaPoolId: string
  chainId: number
  rangeKey: string
}): Promise<ArenaLeaderboardCacheDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  await ensureIndexes()

  const doc = await db.collection(COLLECTIONS.arenaLeaderboardCache).findOne({
    arenaPoolId: input.arenaPoolId,
    chainId: input.chainId,
    rangeKey: input.rangeKey,
  })
  return doc as ArenaLeaderboardCacheDoc | null
}

export async function upsertArenaLeaderboardCache(input: {
  arenaPoolId: string
  chainId: number
  rangeKey: string
  entries: ArenaLeaderboardEntry[]
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return
  await ensureIndexes()

  const now = new Date()
  await db.collection(COLLECTIONS.arenaLeaderboardCache).updateOne(
    {
      arenaPoolId: input.arenaPoolId,
      chainId: input.chainId,
      rangeKey: input.rangeKey,
    },
    {
      $set: {
        arenaPoolId: input.arenaPoolId,
        chainId: input.chainId,
        rangeKey: input.rangeKey,
        entries: input.entries,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}
