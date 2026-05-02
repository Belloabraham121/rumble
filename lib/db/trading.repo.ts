import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type TradingAttemptKind =
  | "quote"
  | "check_approval"
  | "swap"
  | "order"
  | "execute"
  | "lp_check_approval"
  | "lp_create"
  | "lp_increase"
  | "lp_decrease"
  | "lp_claim"
  | "lp_migrate"
  | "lp_claim_rewards"

export type TradingAttemptDoc = {
  _id: ObjectId
  romboUserIdHex?: string
  email?: string
  agentId?: string
  idempotencyKey?: string
  kind: TradingAttemptKind
  uniswapRequestId?: string
  routing?: string
  /** sha256 hex of swap calldata or hashed payload */
  calldataHash?: string
  payloadHash?: string
  /** Chain the attempt was for (receipt poller + analytics). */
  chainId?: number
  quoteExpiresAt?: Date
  broadcastNonce?: number
  txHash?: string
  status: "ok" | "error"
  errorCode?: string
  excerpt?: string
  createdAt: Date
}

export type InsertTradingAttemptInput = Omit<TradingAttemptDoc, "_id" | "createdAt">

/** Append-only audit row for quotes / approvals / swap builds / orders. */
export async function insertTradingAttempt(input: InsertTradingAttemptInput): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  await db.collection(COLLECTIONS.tradingAttempts).insertOne({
    ...input,
    createdAt: new Date(),
  })
}

export type WalletChainNonceDoc = {
  _id: ObjectId
  walletAddress: string
  chainId: number
  lastNonce?: number
  lastTxHash?: string
  updatedAt: Date
}

/** Track last broadcast nonce for reconciliation (optional `broadcastNonce` from client). */
/**
 * Recent successful attempts that broadcast a tx — receipt may still be pending.
 * Used by the cron poller (join with `onchain_receipts` in application code).
 */
export async function listTradingAttemptsRecentWithTx(input: {
  limit?: number
  maxAgeMs?: number
}): Promise<TradingAttemptDoc[]> {
  const db = await getMongoDb()
  if (!db) return []

  const lim = Math.min(Math.max(input.limit ?? 80, 1), 300)
  const maxAge = input.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000
  const since = new Date(Date.now() - maxAge)

  const cur = db
    .collection(COLLECTIONS.tradingAttempts)
    .find({
      status: "ok",
      txHash: { $exists: true, $nin: [null, ""] },
      chainId: { $exists: true },
      createdAt: { $gte: since },
    })
    .sort({ createdAt: -1 })
    .limit(lim)

  const rows = await cur.toArray()
  return rows as TradingAttemptDoc[]
}

export async function upsertWalletChainNonce(input: {
  walletAddress: string
  chainId: number
  nonce: number
  txHash?: string
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const now = new Date()
  const addr = input.walletAddress.trim().toLowerCase()

  await db.collection(COLLECTIONS.walletChainNonces).updateOne(
    { walletAddress: addr, chainId: input.chainId },
    {
      $set: {
        walletAddress: addr,
        chainId: input.chainId,
        lastNonce: input.nonce,
        ...(input.txHash ? { lastTxHash: input.txHash } : {}),
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}
