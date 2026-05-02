import { NextResponse } from "next/server"
import {
  agentDocToAgent,
  findAgentForUser,
  listAgentsForUser,
  type AgentDoc,
} from "@/lib/db/agents.repo"
import {
  listOnchainReceiptsForAgent,
  listOnchainReceiptsForUser,
} from "@/lib/db/onchain-receipts.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import type { AgentActivityEvent } from "@/components/dashboard/activity-types"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

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
 * Unified ledger feed: **on-chain receipts** from Mongo + optional **synthetic** activity
 * persisted with agents (same rows as the arena chart / local simulator when synced).
 *
 * Query: `agentId` — omit or `all` for every agent; `includeSynthetic=true` merges stored activity.
 */
export async function GET(req: Request) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json(
      { error: "MongoDB is not configured.", receipts: [], syntheticEvents: [] },
      { status: 503 },
    )
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const agentIdParam = url.searchParams.get("agentId")?.trim()
  const includeSynthetic = url.searchParams.get("includeSynthetic") === "true"
  const receiptLimit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 120, 1),
    300,
  )

  const uid = identity.romboUserIdHex

  let receiptsRaw =
    !agentIdParam || agentIdParam === "all"
      ? await listOnchainReceiptsForUser({ romboUserIdHex: uid, limit: receiptLimit })
      : await listOnchainReceiptsForAgent({
          agentId: agentIdParam,
          romboUserIdHex: uid,
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

  let syntheticEvents: (AgentActivityEvent & {
    agentId: string
    agentName: string
    source: "synthetic"
  })[] = []

  if (includeSynthetic) {
    let agentDocs: AgentDoc[] = []
    if (!agentIdParam || agentIdParam === "all") {
      agentDocs = await listAgentsForUser(uid)
    } else {
      const one = await findAgentForUser(uid, agentIdParam)
      if (one) agentDocs = [one]
    }

    for (const doc of agentDocs) {
      if (!doc) continue
      const a = agentDocToAgent(doc)
      for (const ev of a.activity) {
        syntheticEvents.push({
          ...ev,
          agentId: a.id,
          agentName: a.config.name,
          source: "synthetic",
        })
      }
    }

    syntheticEvents.sort((x, y) => y.at - x.at)
    if (syntheticEvents.length > 200) {
      syntheticEvents = syntheticEvents.slice(0, 200)
    }
  }

  return NextResponse.json({
    receipts,
    syntheticEvents,
    agentId: agentIdParam && agentIdParam !== "all" ? agentIdParam : undefined,
  })
}
