import "server-only"

import { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

export type RomboUserDoc = {
  _id: ObjectId
  email: string
  privyUserId?: string
  privyEmbeddedWalletId?: string
  privyEmbeddedWalletAddress?: string
  createdAt: Date
  updatedAt: Date
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Upsert user by email; returns the persisted document. */
export async function upsertUserByEmail(email: string): Promise<RomboUserDoc | null> {
  const db = await getMongoDb()
  if (!db) return null

  const normalized = normalizeEmail(email)
  const now = new Date()
  const col = db.collection<RomboUserDoc>(COLLECTIONS.users)

  await col.updateOne(
    { email: normalized },
    {
      $set: { email: normalized, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )

  return col.findOne({ email: normalized })
}

export async function updateUserPrivyBridge(
  email: string,
  patch: Pick<RomboUserDoc, "privyUserId" | "privyEmbeddedWalletId" | "privyEmbeddedWalletAddress">,
): Promise<void> {
  const db = await getMongoDb()
  if (!db) return

  const normalized = normalizeEmail(email)
  await db.collection(COLLECTIONS.users).updateOne(
    { email: normalized },
    {
      $set: {
        ...patch,
        updatedAt: new Date(),
      },
    },
  )
}

export async function getUserByEmail(email: string): Promise<RomboUserDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  return db.collection<RomboUserDoc>(COLLECTIONS.users).findOne({ email: normalizeEmail(email) })
}

/** Lookup by Mongo `_id` hex string (24-char ObjectId). */
export async function getUserByRomboUserIdHex(hex: string): Promise<RomboUserDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  try {
    const id = ObjectId.createFromHexString(hex.trim())
    return db.collection<RomboUserDoc>(COLLECTIONS.users).findOne({ _id: id })
  } catch {
    return null
  }
}
