import { NextResponse } from "next/server"
import {
  listOnchainReceiptsForAgent,
  listOnchainReceiptsForUser,
} from "@/lib/db/onchain-receipts.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { buildLedgerActivityRowsForUser } from "@/lib/agents/activity-join"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export type DashboardReceiptDto = {
  chainId: number
  txHash: string
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
  status?: "success" | "reverted"
  agentId?: string
  arenaPoolId?: string
  clientEventId?: string
  source: string
  updatedAt: string
}

/**
 * Unified ledger feed: **on-chain receipts** + **`agent_runs`** execution rows (joined activity).
 *
 * Query: `agentId` — omit or `all` for every agent scope.
 */
export async function GET(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json(
      { error: "MongoDB is not configured.", receipts: [], activityEvents: [] },
      { status: 503 },
    )
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const agentIdParam = url.searchParams.get("agentId")?.trim()
  const receiptLimit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 120, 1),
    300,
  )

  const uid = identity.rumbleUserIdHex

  let receiptsRaw =
    !agentIdParam || agentIdParam === "all"
      ? await listOnchainReceiptsForUser({ rumbleUserIdHex: uid, limit: receiptLimit })
      : await listOnchainReceiptsForAgent({
          agentId: agentIdParam,
          rumbleUserIdHex: uid,
          limit: receiptLimit,
        })

  const receipts: DashboardReceiptDto[] = receiptsRaw.map(r => ({
    chainId: r.chainId,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    gasUsed: r.gasUsed,
    effectiveGasPrice: r.effectiveGasPrice,
    status: r.status,
    agentId: r.agentId,
    arenaPoolId: r.arenaPoolId,
    clientEventId: r.clientEventId,
    source: r.source,
    updatedAt: r.updatedAt.toISOString(),
  }))

  const activityEvents = await buildLedgerActivityRowsForUser({
    rumbleUserIdHex: uid,
    agentId:
      agentIdParam && agentIdParam !== "all" ? agentIdParam : undefined,
    limit: receiptLimit,
  })

  return NextResponse.json({
    receipts,
    activityEvents,
    agentId: agentIdParam && agentIdParam !== "all" ? agentIdParam : undefined,
  })
}
