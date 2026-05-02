import "server-only"

import { MongoClient, type Db } from "mongodb"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

let client: MongoClient | null | undefined

/** MongoDB connection — null when `MONGODB_URI` is unset. */
export async function getMongoDb(): Promise<Db | null> {
  const uri = getRomboServerEnv().mongodbUri
  if (!uri) return null

  if (client === undefined) {
    client = new MongoClient(uri)
    await client.connect()
  }
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "rombo"
  return client.db(dbName)
}
