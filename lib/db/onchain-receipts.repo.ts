import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type OnchainReceiptSource = "client" | "webhook" | "poll"

export type OnchainReceiptDoc = {
  _id: ObjectId
  romboUserIdHex?: string
  chainId: number
  txHash: string
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
  status?: "success" | "reverted"
  agentId?: string
  walletAddress?: string
  /** Optional link to a client-side activity row id. */
  clientEventId?: string
  arenaPoolId?: string
  source: OnchainReceiptSource
  /** Optional excerpt for indexer payloads (never store full signed bundles). */
  excerpt?: string
  createdAt: Date
  updatedAt: Date
}

export type UpsertOnchainReceiptInput = Omit<OnchainReceiptDoc, "_id" | "createdAt" | "updatedAt">

export function normalizeTxHash(txHash: string): string {
  const h = txHash.trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(h)) {
    throw new Error("Invalid transaction hash (expected 0x + 64 hex chars).")
  }
  return h
}

export async function upsertOnchainReceipt(input: UpsertOnchainReceiptInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const txHash = normalizeTxHash(input.txHash)
  const now = new Date()

  await db.collection(COLLECTIONS.onchainReceipts).updateOne(
    { chainId: input.chainId, txHash },
    {
      $set: {
        ...input,
        txHash,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  )
}

export async function listOnchainReceiptsForAgent(input: {
  agentId: string
  /** When set (dashboard session user), restrict to receipts recorded for that Rombo user. */
  romboUserIdHex?: string
  limit?: number
}): Promise<OnchainReceiptDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const lim = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const filter: Record<string, unknown> = { agentId: input.agentId }
  if (input.romboUserIdHex) {
    filter.romboUserIdHex = input.romboUserIdHex
  }

  const cur = db
    .collection(COLLECTIONS.onchainReceipts)
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(lim)

  const rows = await cur.toArray()
  return rows as OnchainReceiptDoc[]
}
