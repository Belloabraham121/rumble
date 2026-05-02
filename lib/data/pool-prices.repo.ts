import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

/**
 * Cached spot price for an arena pool. Keyed by `(chainId, arenaPoolId)` — poolAddress
 * is redundant but stored to survive arena → pool remapping. TTL-swept by Mongo via
 * the `fetchedAt` index; see `ensurePoolPriceIndexes()`.
 */
export type PoolPriceDoc = {
  _id: ObjectId
  chainId: number
  arenaPoolId: string
  poolAddress: string
  /** Price of token0 in token1 units (raw subgraph number). */
  token0Price: string
  token1Price: string
  /** USD-normalised prices when subgraph provides a derivedETH bundle. */
  token0PriceUsd?: string
  token1PriceUsd?: string
  /** The canonical display USD price for the pool (token0PriceUsd by default). */
  displayUsd?: string
  tick?: string
  sqrtPriceX96?: string
  token0Symbol?: string
  token1Symbol?: string
  totalValueLockedUsd?: string
  volumeUsd24h?: string
  feesUsd24h?: string
  /** Where the price came from; "stale" only for debug when the upstream fails. */
  source: "subgraph" | "quoter" | "stale"
  fetchedAt: Date
}

export type UpsertPoolPriceInput = Omit<PoolPriceDoc, "_id" | "fetchedAt"> & {
  fetchedAt?: Date
}

let ensuredIndexes = false

/** Idempotent; called from cron + read path on first miss. */
export async function ensurePoolPriceIndexes(): Promise<void> {
  if (ensuredIndexes) return
  const db = await getMongoDb()
  if (!db) return

  const col = db.collection(COLLECTIONS.poolPrices)
  try {
    await col.createIndex(
      { chainId: 1, arenaPoolId: 1 },
      { unique: true, name: "chain_arena_unique" },
    )
    await col.createIndex({ fetchedAt: 1 }, { name: "fetchedAt_ttl", expireAfterSeconds: 60 * 60 })
    ensuredIndexes = true
  } catch {
    // Indexes may already exist with different spec; safe to ignore.
  }
}

export async function upsertPoolPrice(input: UpsertPoolPriceInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  await ensurePoolPriceIndexes()

  const now = input.fetchedAt ?? new Date()
  await db.collection(COLLECTIONS.poolPrices).updateOne(
    { chainId: input.chainId, arenaPoolId: input.arenaPoolId },
    {
      $set: {
        ...input,
        poolAddress: input.poolAddress.toLowerCase(),
        fetchedAt: now,
      },
    },
    { upsert: true },
  )
}

export async function getPoolPrice(input: {
  chainId: number
  arenaPoolId: string
}): Promise<PoolPriceDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  await ensurePoolPriceIndexes()

  const doc = await db.collection(COLLECTIONS.poolPrices).findOne({
    chainId: input.chainId,
    arenaPoolId: input.arenaPoolId,
  })
  return doc as PoolPriceDoc | null
}

export async function listPoolPrices(chainId: number): Promise<PoolPriceDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  await ensurePoolPriceIndexes()
  const rows = await db
    .collection(COLLECTIONS.poolPrices)
    .find({ chainId })
    .sort({ arenaPoolId: 1 })
    .toArray()
  return rows as PoolPriceDoc[]
}
