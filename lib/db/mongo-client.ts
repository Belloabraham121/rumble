import "server-only"

import { MongoClient, type Db } from "mongodb"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/** Single in-flight connect — avoids duplicate connects; cleared on failure so the next call can retry. */
let connectPromise: Promise<MongoClient> | null = null

function mongoClientOptions() {
  return {
    /** Fail fast instead of hanging the dashboard for minutes when Atlas/network is unreachable. */
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
  } as const
}

async function getConnectedClient(uri: string): Promise<MongoClient> {
  if (!connectPromise) {
    const mc = new MongoClient(uri, mongoClientOptions())
    connectPromise = mc.connect().catch((err: unknown) => {
      connectPromise = null
      throw err
    })
  }
  return connectPromise
}

/** MongoDB connection — null when `MONGODB_URI` is unset. */
export async function getMongoDb(): Promise<Db | null> {
  const uri = getRumbleServerEnv().mongodbUri
  if (!uri) return null

  const client = await getConnectedClient(uri)
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "rumble"
  return client.db(dbName)
}
