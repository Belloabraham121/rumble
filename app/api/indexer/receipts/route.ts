import { NextResponse } from "next/server"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { listOnchainReceiptsForAgent } from "@/lib/db/onchain-receipts.repo"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/**
 * List persisted receipts for an agent (dashboard / Transactions page backing store).
 */
export async function GET(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!identity.rumbleUserIdHex) {
    return NextResponse.json(
      { error: "Account is not linked to a persisted Rumble user id." },
      { status: 403 },
    )
  }

  const url = new URL(req.url)
  const agentId = url.searchParams.get("agentId")?.trim()
  if (!agentId) {
    return NextResponse.json({ error: "agentId query parameter is required" }, { status: 400 })
  }

  const limitRaw = url.searchParams.get("limit")
  const limit = limitRaw ? Number(limitRaw) : 50

  const rows = await listOnchainReceiptsForAgent({
    agentId,
    rumbleUserIdHex: identity.rumbleUserIdHex,
    limit,
  })

  return NextResponse.json({
    receipts: rows.map(r => ({
      chainId: r.chainId,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      gasUsed: r.gasUsed,
      effectiveGasPrice: r.effectiveGasPrice,
      status: r.status,
      agentId: r.agentId,
      clientEventId: r.clientEventId,
      arenaPoolId: r.arenaPoolId,
      source: r.source,
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}
