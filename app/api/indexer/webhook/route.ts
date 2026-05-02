import { NextResponse } from "next/server"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"
import { applyReceiptEvent } from "@/lib/indexer/apply-receipt-event"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

const WEBHOOK_HEADER = "x-rumble-webhook-secret"

/**
 * External indexer / pipeline pushes normalized receipt rows (polling substitute).
 * Secured with `RUMBLE_INDEXER_WEBHOOK_SECRET` — send the same value in header **`x-rumble-webhook-secret`**.
 */
export async function POST(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasIndexerWebhook) {
    return NextResponse.json({ error: "RUMBLE_INDEXER_WEBHOOK_SECRET is not configured." }, { status: 503 })
  }
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const secret = req.headers.get(WEBHOOK_HEADER)?.trim()
  if (!secret || secret !== env.indexerWebhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 })
  }

  const root = body as Record<string, unknown>
  const events = root.events
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "Expected non-empty events array" }, { status: 400 })
  }

  const idempotencyKey =
    typeof root.idempotencyKey === "string" ? root.idempotencyKey.slice(0, 128) : undefined

  const db = await getMongoDb()
  if (db && idempotencyKey) {
    const exists = await db.collection(COLLECTIONS.indexerWebhookDeliveries).findOne({
      idempotencyKey,
    })
    if (exists) {
      return NextResponse.json({ ok: true, duplicate: true, processed: 0 })
    }
  }

  let processed = 0
  const errors: string[] = []

  for (const ev of events) {
    if (!ev || typeof ev !== "object") {
      errors.push("invalid event object")
      continue
    }
    const e = ev as Record<string, unknown>
    const txHash = typeof e.txHash === "string" ? e.txHash : undefined
    const chainId = typeof e.chainId === "number" ? e.chainId : Number(e.chainId)
    if (!txHash || !Number.isFinite(chainId)) {
      errors.push("missing txHash or chainId")
      continue
    }

    try {
      await applyReceiptEvent(
        {
          chainId,
          txHash,
          blockNumber:
            typeof e.blockNumber === "number"
              ? e.blockNumber
              : typeof e.blockNumber === "string"
                ? Number(e.blockNumber)
                : undefined,
          gasUsed: typeof e.gasUsed === "string" ? e.gasUsed : undefined,
          effectiveGasPrice: typeof e.effectiveGasPrice === "string" ? e.effectiveGasPrice : undefined,
          status: e.status === "reverted" ? "reverted" : e.status === "success" ? "success" : undefined,
          agentId: typeof e.agentId === "string" ? e.agentId : undefined,
          rumbleUserIdHex: typeof e.rumbleUserIdHex === "string" ? e.rumbleUserIdHex : undefined,
          walletAddress: typeof e.walletAddress === "string" ? e.walletAddress : undefined,
          clientEventId: typeof e.clientEventId === "string" ? e.clientEventId : undefined,
          arenaPoolId: typeof e.arenaPoolId === "string" ? e.arenaPoolId : undefined,
          excerpt: typeof e.excerpt === "string" ? e.excerpt.slice(0, 500) : undefined,
        },
        "webhook",
      )
      processed += 1
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "persist failed")
    }
  }

  if (db && idempotencyKey && processed > 0) {
    await db.collection(COLLECTIONS.indexerWebhookDeliveries).insertOne({
      idempotencyKey,
      processed,
      receivedAt: new Date(),
    })
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed,
    errors: errors.length ? errors : undefined,
  })
}
