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

/**
 * Map a Uniswap unsigned-tx JSON object into a viem-compatible shape.
 * Exported for callers that consume non-`create/increase/decrease` arrays
 * (e.g. the `transactions[]` returned by `/lp/check_approval`).
 */
export function mapLabUnsignedTx(o: Record<string, unknown>): LabUnsignedTx | null {
  return mapTx(o)
}

function mapTx(o: Record<string, unknown>): LabUnsignedTx | null {
  /** The Uniswap LP API's `/lp/check_approval` wraps each entry in `transactions[]` as
   * `{ transaction: TransactionRequest, cancelApproval, action }`. Top-level shapes elsewhere
   * (e.g. `lpJson.create` / `lpJson.poolCreation`) are flat. Unwrap defensively so both work.
   * Proven in debug-454cbc.log line 3: `firstRawKeys:["transaction","cancelApproval","action"]`. */
  const inner =
    o && typeof o.transaction === "object" && o.transaction !== null
      ? (o.transaction as Record<string, unknown>)
      : o
  const to = typeof inner.to === "string" ? (inner.to as Address) : undefined
  const data = typeof inner.data === "string" ? (inner.data as Hex) : undefined
  if (!to || !data?.startsWith("0x")) return null

  const gasRaw = (inner.gasLimit ?? inner.gas_limit ?? inner.gas) as string | number | undefined
  const valueRaw = inner.value as string | number | undefined

  return {
    to,
    data,
    from: typeof inner.from === "string" ? (inner.from as Address) : undefined,
    value: hexQty(valueRaw),
    gas: hexQty(gasRaw as string | number | undefined),
    maxFeePerGas: hexQty((inner.maxFeePerGas ?? inner.max_fee_per_gas) as string | number | undefined),
    maxPriorityFeePerGas: hexQty(
      (inner.maxPriorityFeePerGas ?? inner.max_priority_fee_per_gas) as string | number | undefined,
    ),
    nonce:
      typeof inner.nonce === "number"
        ? inner.nonce
        : typeof inner.nonce === "string"
          ? Number.parseInt(inner.nonce, 10)
          : undefined,
    chainId:
      typeof inner.chainId === "number"
        ? inner.chainId
        : typeof inner.chain_id === "number"
          ? inner.chain_id
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
