import "server-only"

/** Matches Privy `UnsignedStandardEthereumTransaction` shape closely enough for JSON-RPC. */
export type RumbleUnsignedEthTx = {
  to?: string
  data?: `0x${string}`
  from?: string
  value?: string | number
  gas_limit?: string | number
  max_fee_per_gas?: string | number
  max_priority_fee_per_gas?: string | number
  nonce?: string | number
  chain_id?: string | number
  type?: 0 | 1 | 2 | 4
}

function asHexQuantity(n: string | number | undefined): string | number | undefined {
  if (n === undefined) return undefined
  if (typeof n === "number") return n
  const s = n.trim()
  if (s.startsWith("0x")) return s
  if (/^\d+$/.test(s)) return `0x${BigInt(s).toString(16)}`
  return s
}

/** Map a Liquidity API `TransactionRequest` or similar object to Privy broadcast shape. */
export function mapTransactionRequestRecordToRumble(o: Record<string, unknown>): RumbleUnsignedEthTx | null {
  const to = typeof o.to === "string" ? o.to : undefined
  const data = typeof o.data === "string" ? o.data : undefined
  if (!to || !data?.startsWith("0x")) return null

  const tx: RumbleUnsignedEthTx = {
    to,
    data: data as `0x${string}`,
    from: typeof o.from === "string" ? o.from : undefined,
    value: asHexQuantity(o.value as string | number | undefined),
    gas_limit: asHexQuantity((o.gasLimit ?? o.gas_limit) as string | number | undefined),
    max_fee_per_gas: asHexQuantity((o.maxFeePerGas ?? o.max_fee_per_gas) as string | number | undefined),
    max_priority_fee_per_gas: asHexQuantity(
      (o.maxPriorityFeePerGas ?? o.max_priority_fee_per_gas) as string | number | undefined,
    ),
    nonce: asHexQuantity(o.nonce as string | number | undefined),
    chain_id: asHexQuantity(
      (typeof o.chainId === "string" || typeof o.chainId === "number"
        ? o.chainId
        : typeof o.chain_id === "string" || typeof o.chain_id === "number"
          ? o.chain_id
          : undefined) as string | number | undefined,
    ),
    type:
      typeof o.type === "number" && (o.type === 0 || o.type === 1 || o.type === 2 || o.type === 4)
        ? o.type
        : undefined,
  }
  return tx
}

/** Best-effort pull an unsigned tx for Privy `eth_sendTransaction` from a `/swap` JSON body. */
export function tryExtractUnsignedTxFromSwapResponse(root: unknown): RumbleUnsignedEthTx | null {
  if (!root || typeof root !== "object") return null

  const candidates: unknown[] = [root]
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return
    const o = v as Record<string, unknown>
    if (o.transaction && typeof o.transaction === "object") candidates.push(o.transaction)
    if (o.tx && typeof o.tx === "object") candidates.push(o.tx)
    if (o.swap && typeof o.swap === "object") candidates.push(o.swap)
    for (const x of Object.values(o)) {
      if (x && typeof x === "object" && !candidates.includes(x)) visit(x)
    }
  }
  visit(root)

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const o = c as Record<string, unknown>
    const tx = mapTransactionRequestRecordToRumble(o)
    if (tx) return tx
  }
  return null
}

/** Scan swap /sendTransaction responses for a tx hash string. */
export function tryExtractTxHash(root: unknown): string | undefined {
  if (!root || typeof root !== "object") return undefined
  const stack: unknown[] = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object") continue
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (
        (k === "hash" || k === "txHash" || k === "transactionHash") &&
        typeof v === "string" &&
        /^0x[0-9a-fA-F]{64}$/.test(v)
      ) {
        return v.toLowerCase()
      }
      if (v && typeof v === "object") stack.push(v)
    }
  }
  return undefined
}
