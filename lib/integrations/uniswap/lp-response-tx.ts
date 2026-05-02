import "server-only"

import { mapTransactionRequestRecordToRumble, type RumbleUnsignedEthTx } from "@/lib/integrations/uniswap/swap-response-tx"

/**
 * Liquidity API success bodies expose one or more txs: optional pool creation, then
 * create / increase / decrease. Preserve broadcast order when multiple are present.
 */
export function extractOrderedLpTransactions(root: unknown): RumbleUnsignedEthTx[] {
  const out: RumbleUnsignedEthTx[] = []
  if (!root || typeof root !== "object") return out
  const o = root as Record<string, unknown>

  for (const key of ["poolCreation", "pool_creation"] as const) {
    const tx = o[key]
    if (tx && typeof tx === "object") {
      const m = mapTransactionRequestRecordToRumble(tx as Record<string, unknown>)
      if (m) out.push(m)
    }
  }

  for (const key of ["create", "increase", "decrease"] as const) {
    const tx = o[key]
    if (tx && typeof tx === "object") {
      const m = mapTransactionRequestRecordToRumble(tx as Record<string, unknown>)
      if (m) out.push(m)
    }
  }

  return out
}
