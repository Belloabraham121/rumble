import "server-only"

import { applyReceiptEvent } from "@/lib/indexer/apply-receipt-event"
import { findOnchainReceipt } from "@/lib/db/onchain-receipts.repo"
import { listTradingAttemptsRecentWithTx } from "@/lib/db/trading.repo"
import { ethGetTransactionReceipt, resolveAgentRuntimeRpcUrl } from "@/lib/rombo/json-rpc"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

function normalizeHash(h: string): `0x${string}` | null {
  const x = h.trim().toLowerCase()
  return /^0x[0-9a-f]{64}$/.test(x) ? (x as `0x${string}`) : null
}

/**
 * Best-effort fetch receipts for recent successful trading attempts that are not yet indexed.
 */
export async function pollPendingTradingReceipts(): Promise<{
  scanned: number
  applied: number
  pending: number
  errors: string[]
}> {
  const env = getRomboServerEnv()
  const attempts = await listTradingAttemptsRecentWithTx({ limit: 100, maxAgeMs: 7 * 86400000 })

  let scanned = 0
  let applied = 0
  let pending = 0
  const errors: string[] = []

  for (const a of attempts) {
    if (!a.txHash || a.chainId === undefined) continue
    const hash = normalizeHash(a.txHash)
    if (!hash) continue

    scanned += 1

    const existing = await findOnchainReceipt({ chainId: a.chainId, txHash: hash })
    if (existing?.blockNumber !== undefined && existing.status) {
      continue
    }

    let rpcUrl: string
    try {
      rpcUrl = resolveAgentRuntimeRpcUrl(a.chainId, env.romboRpcUrl)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
      continue
    }

    let receipt: Awaited<ReturnType<typeof ethGetTransactionReceipt>>
    try {
      receipt = await ethGetTransactionReceipt(rpcUrl, hash)
    } catch (e) {
      errors.push(`${hash.slice(0, 10)}… ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    if (receipt === "pending" || receipt === null) {
      pending += 1
      continue
    }

    await applyReceiptEvent(
      {
        chainId: a.chainId,
        txHash: hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        status: receipt.status,
        agentId: a.agentId,
        romboUserIdHex: a.romboUserIdHex,
        excerpt: "poll",
      },
      "poll",
    )
    applied += 1
  }

  return { scanned, applied, pending, errors }
}
