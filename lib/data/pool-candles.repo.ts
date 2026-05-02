import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import type { SubgraphCandleGranularity, SubgraphPoolCandle } from "@/lib/integrations/uniswap/subgraph"

/** Single OHLC bucket stored per `(chainId, arenaPoolId, granularity, periodStartUnix)`. */
export type PoolCandleDoc = {
  _id: ObjectId
  chainId: number
  arenaPoolId: string
  poolAddress: string
  granularity: SubgraphCandleGranularity
  periodStartUnix: number
  open: string
  high: string
  low: string
  close: string
  volumeUsd?: string
  tvlUsd?: string
  fetchedAt: Date
}

let ensuredIndexes = false

export async function ensurePoolCandleIndexes(): Promise<void> {
  if (ensuredIndexes) return
  const db = await getMongoDb()
  if (!db) return

  const col = db.collection(COLLECTIONS.poolCandles)
  try {
    await col.createIndex(
      { chainId: 1, arenaPoolId: 1, granularity: 1, periodStartUnix: 1 },
      { unique: true, name: "chain_arena_gran_period_unique" },
    )
    await col.createIndex({ chainId: 1, arenaPoolId: 1, granularity: 1, periodStartUnix: -1 }, { name: "chain_arena_gran_period_desc" })
    // TTL: minute candles keep 3h of data, hour candles keep 14d (we approximate with one TTL ≈ 14d on fetchedAt).
    await col.createIndex({ fetchedAt: 1 }, { name: "fetchedAt_ttl", expireAfterSeconds: 60 * 60 * 24 * 14 })
    ensuredIndexes = true
  } catch {
    // ignore — may already exist
  }
}

export async function upsertPoolCandles(input: {
  chainId: number
  arenaPoolId: string
  poolAddress: string
  granularity: SubgraphCandleGranularity
  rows: SubgraphPoolCandle[]
}): Promise<number> {
  if (input.rows.length === 0) return 0

  const db = await getMongoDb()
  if (!db) return 0
  await ensurePoolCandleIndexes()

  const now = new Date()
  const addr = input.poolAddress.toLowerCase()

  const ops = input.rows.map((r) => ({
    updateOne: {
      filter: {
        chainId: input.chainId,
        arenaPoolId: input.arenaPoolId,
        granularity: input.granularity,
        periodStartUnix: r.periodStartUnix,
      },
      update: {
        $set: {
          chainId: input.chainId,
          arenaPoolId: input.arenaPoolId,
          poolAddress: addr,
          granularity: input.granularity,
          periodStartUnix: r.periodStartUnix,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volumeUsd: r.volumeUsd,
          tvlUsd: r.tvlUsd,
          fetchedAt: now,
        },
      },
      upsert: true as const,
    },
  }))

  const res = await db.collection(COLLECTIONS.poolCandles).bulkWrite(ops, { ordered: false })
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0)
}

export async function listPoolCandles(input: {
  chainId: number
  arenaPoolId: string
  granularity: SubgraphCandleGranularity
  limit?: number
}): Promise<PoolCandleDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  await ensurePoolCandleIndexes()

  const lim = Math.min(Math.max(input.limit ?? 120, 1), 500)
  const rows = await db
    .collection(COLLECTIONS.poolCandles)
    .find({
      chainId: input.chainId,
      arenaPoolId: input.arenaPoolId,
      granularity: input.granularity,
    })
    .sort({ periodStartUnix: -1 })
    .limit(lim)
    .toArray()

  return (rows as PoolCandleDoc[]).reverse()
}
