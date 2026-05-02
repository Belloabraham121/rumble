import "server-only"

import {
  upsertOnchainReceipt,
  type OnchainReceiptSource,
} from "@/lib/db/onchain-receipts.repo"

export type ReceiptEventPayload = {
  chainId: number
  txHash: string
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
  status?: "success" | "reverted"
  agentId?: string
  romboUserIdHex?: string
  walletAddress?: string
  clientEventId?: string
  arenaPoolId?: string
  excerpt?: string
}

/** Shared upsert used by the session receipt route and the indexer webhook. */
export async function applyReceiptEvent(
  payload: ReceiptEventPayload,
  source: OnchainReceiptSource,
): Promise<void> {
  const blockNumber =
    payload.blockNumber !== undefined && Number.isFinite(payload.blockNumber)
      ? Math.trunc(payload.blockNumber)
      : undefined

  await upsertOnchainReceipt({
    chainId: payload.chainId,
    txHash: payload.txHash,
    blockNumber,
    gasUsed: payload.gasUsed,
    effectiveGasPrice: payload.effectiveGasPrice,
    status: payload.status,
    agentId: payload.agentId,
    romboUserIdHex: payload.romboUserIdHex,
    walletAddress: payload.walletAddress?.trim().toLowerCase(),
    clientEventId: payload.clientEventId,
    arenaPoolId: payload.arenaPoolId,
    source,
    excerpt: payload.excerpt,
  })
}
