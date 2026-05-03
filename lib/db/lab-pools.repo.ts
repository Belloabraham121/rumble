import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import type { RomboChainSlug } from "@/lib/rombo/chain-config"

/**
 * A user-deployed Uniswap v4 "lab" pool that an agent can trade against.
 * Keyed by `labPoolId` (deterministic: `${chainSlug}:${v4PoolId}`).
 *
 * `isNative` marks the Uniswap v4 native-ETH side (`0x0000…0000`) so the runtime
 * does not try to resolve it as an ERC-20.
 */
export type LabPoolTokenDoc = {
  address: string
  symbol: string
  decimals: number
  isNative: boolean
}

export type LabPoolDoc = {
  _id: ObjectId
  labPoolId: string
  romboUserIdHex: string
  chainSlug: RomboChainSlug
  chainId: number
  protocol: "V4"
  fee: number
  tickSpacing: number
  hooks: string
  token0: LabPoolTokenDoc
  token1: LabPoolTokenDoc
  v4PoolId: string
  label: string
  createdAt: Date
  updatedAt: Date
}

export type UpsertLabPoolInput = Omit<LabPoolDoc, "_id" | "createdAt" | "updatedAt">

export async function upsertLabPool(input: UpsertLabPoolInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  await db.collection(COLLECTIONS.labPools).updateOne(
    { labPoolId: input.labPoolId, romboUserIdHex: input.romboUserIdHex },
    {
      $set: { ...input, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
}

export async function listLabPoolsForUser(romboUserIdHex: string): Promise<LabPoolDoc[]> {
  const db = await getMongoDb()
  if (!db) return []
  const docs = await db
    .collection(COLLECTIONS.labPools)
    .find({ romboUserIdHex })
    .sort({ createdAt: -1 })
    .toArray()
  return docs as unknown as LabPoolDoc[]
}

export async function getLabPoolById(input: {
  romboUserIdHex: string
  labPoolId: string
}): Promise<LabPoolDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  const doc = await db.collection(COLLECTIONS.labPools).findOne({
    labPoolId: input.labPoolId,
    romboUserIdHex: input.romboUserIdHex,
  })
  return (doc as unknown as LabPoolDoc) ?? null
}
