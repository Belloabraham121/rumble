import type { Address, Hex } from "viem"

/** Matches Uniswap unsigned tx JSON from Liquidity API (see `swap-response-tx.ts`). */
export type LabUnsignedTx = {
  to: Address
  data: Hex
  from?: Address
  value?: bigint
  gas?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  nonce?: number
  chainId?: number
  type?: "eip1559" | "legacy"
}

function hexQty(n: string | number | undefined): bigint | undefined {
  if (n === undefined) return undefined
  if (typeof n === "number") return BigInt(n)
  const s = n.trim()
  if (s.startsWith("0x")) return BigInt(s)
  if (/^\d+$/.test(s)) return BigInt(s)
  return BigInt(s)
}

function mapTx(o: Record<string, unknown>): LabUnsignedTx | null {
  const to = typeof o.to === "string" ? (o.to as Address) : undefined
  const data = typeof o.data === "string" ? (o.data as Hex) : undefined
  if (!to || !data?.startsWith("0x")) return null

  const gasRaw = (o.gasLimit ?? o.gas_limit ?? o.gas) as string | number | undefined
  const valueRaw = o.value as string | number | undefined

  return {
    to,
    data,
    from: typeof o.from === "string" ? (o.from as Address) : undefined,
    value: hexQty(valueRaw),
    gas: hexQty(gasRaw as string | number | undefined),
    maxFeePerGas: hexQty((o.maxFeePerGas ?? o.max_fee_per_gas) as string | number | undefined),
    maxPriorityFeePerGas: hexQty(
      (o.maxPriorityFeePerGas ?? o.max_priority_fee_per_gas) as string | number | undefined,
    ),
    nonce:
      typeof o.nonce === "number"
        ? o.nonce
        : typeof o.nonce === "string"
          ? Number.parseInt(o.nonce, 10)
          : undefined,
    chainId:
      typeof o.chainId === "number"
        ? o.chainId
        : typeof o.chain_id === "number"
          ? o.chain_id
          : undefined,
  }
}

/** Order: pool creation (if any), then create / increase / decrease. */
export function extractOrderedLpTransactionsClient(root: unknown): LabUnsignedTx[] {
  const out: LabUnsignedTx[] = []
  if (!root || typeof root !== "object") return out
  const o = root as Record<string, unknown>

  for (const key of ["poolCreation", "pool_creation"] as const) {
    const tx = o[key]
    if (tx && typeof tx === "object") {
      const m = mapTx(tx as Record<string, unknown>)
      if (m) out.push(m)
    }
  }

  for (const key of ["create", "increase", "decrease"] as const) {
    const tx = o[key]
    if (tx && typeof tx === "object") {
      const m = mapTx(tx as Record<string, unknown>)
      if (m) out.push(m)
    }
  }

  return out
}
