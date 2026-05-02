import { NextResponse } from "next/server"
import { applyReceiptEvent } from "@/lib/indexer/apply-receipt-event"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/**
 * Attach or refresh an on-chain receipt after the client broadcasts a transaction (Privy / wallet).
 * Maps Rumble execution rows to **real** tx hashes, block number, and gas for the Transactions UI.
 */
export async function POST(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity) {
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

  const o = body as Record<string, unknown>
  const txHash = typeof o.txHash === "string" ? o.txHash : undefined
  const chainId = typeof o.chainId === "number" ? o.chainId : Number(o.chainId)

  if (!txHash || !Number.isFinite(chainId)) {
    return NextResponse.json({ error: "txHash and chainId are required" }, { status: 400 })
  }

  const blockNumberRaw =
    typeof o.blockNumber === "number"
      ? o.blockNumber
      : typeof o.blockNumber === "string"
        ? Number(o.blockNumber)
        : NaN
  const blockNumber = Number.isFinite(blockNumberRaw) ? Math.trunc(blockNumberRaw) : undefined
  const gasUsed = typeof o.gasUsed === "string" ? o.gasUsed : undefined
  const effectiveGasPrice =
    typeof o.effectiveGasPrice === "string" ? o.effectiveGasPrice : undefined
  const status =
    o.status === "success" || o.status === "reverted" ? o.status : undefined
  const agentId = typeof o.agentId === "string" ? o.agentId : undefined
  const walletAddress = typeof o.walletAddress === "string" ? o.walletAddress : undefined
  const clientEventId = typeof o.clientEventId === "string" ? o.clientEventId : undefined
  const arenaPoolId = typeof o.arenaPoolId === "string" ? o.arenaPoolId : undefined
  const excerpt = typeof o.excerpt === "string" ? o.excerpt.slice(0, 500) : undefined

  try {
    await applyReceiptEvent(
      {
        chainId,
        txHash,
        blockNumber,
        gasUsed,
        effectiveGasPrice,
        status,
        agentId,
        rumbleUserIdHex: identity.rumbleUserIdHex,
        walletAddress,
        clientEventId,
        arenaPoolId,
        excerpt,
      },
      "client",
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[indexer/receipt]", e)
    const message = e instanceof Error ? e.message : "Failed to persist receipt"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
