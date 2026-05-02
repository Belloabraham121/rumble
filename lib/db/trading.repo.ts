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
