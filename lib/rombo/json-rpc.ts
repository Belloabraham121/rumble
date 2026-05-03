import "server-only"

const DEFAULT_RPC_BY_CHAIN: Record<number, string> = {
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
}

export function defaultPublicRpcUrl(chainId: number): string | undefined {
  return DEFAULT_RPC_BY_CHAIN[chainId]
}

export type EthReceiptLite = {
  status: "success" | "reverted"
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
}

export async function ethGetTransactionReceipt(
  rpcUrl: string,
  txHash: `0x${string}`,
): Promise<EthReceiptLite | null | "pending"> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  })

  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}`)
  }

  const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (json.error?.message) {
    throw new Error(json.error.message)
  }

  const r = json.result
  if (r === null || r === undefined) {
    return "pending"
  }

  if (typeof r !== "object" || !r) {
    return null
  }

  const o = r as Record<string, unknown>
  const statusHex = typeof o.status === "string" ? o.status : undefined
  const success = statusHex === "0x1" || statusHex === "0x01"

  const blockHex = typeof o.blockNumber === "string" ? o.blockNumber : undefined
  let blockNumber: number | undefined
  if (blockHex?.startsWith("0x")) {
    blockNumber = Number.parseInt(blockHex, 16)
  }

  return {
    status: success ? "success" : "reverted",
    blockNumber: Number.isFinite(blockNumber) ? blockNumber : undefined,
    gasUsed: typeof o.gasUsed === "string" ? o.gasUsed : undefined,
    effectiveGasPrice: typeof o.effectiveGasPrice === "string" ? o.effectiveGasPrice : undefined,
  }
}

export function resolveAgentRuntimeRpcUrl(chainId: number, override?: string): string {
  const trimmed = override?.trim()
  if (trimmed) return trimmed
  const fallback = defaultPublicRpcUrl(chainId)
  if (!fallback) {
    throw new Error(`No RPC URL for chain ${chainId} — set ROMBO_RPC_URL`)
  }
  return fallback
}

function hexToBigInt(hex: string): bigint {
  const h = hex.startsWith("0x") ? hex : `0x${hex}`
  return BigInt(h)
}

/** `eth_getBalance` — returns wei as bigint. */
export async function ethGetBalanceWei(rpcUrl: string, address: string): Promise<bigint> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = (await res.json()) as { result?: string; error?: { message?: string } }
  if (json.error?.message) throw new Error(json.error.message)
  const r = json.result
  if (typeof r !== "string" || !r.startsWith("0x")) return BigInt(0)
  return hexToBigInt(r)
}

const ERC20_BALANCE_OF = "0x70a08231"

/** `balanceOf(owner)` for `token` — returns raw units (bigint). */
export async function erc20BalanceOfRaw(
  rpcUrl: string,
  tokenAddress: string,
  ownerAddress: string,
): Promise<bigint> {
  const owner = ownerAddress.replace(/^0x/i, "").toLowerCase()
  if (owner.length !== 40) return BigInt(0)
  const data = `${ERC20_BALANCE_OF}${"0".repeat(24)}${owner}` as `0x${string}`
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddress, data }, "latest"],
    }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = (await res.json()) as { result?: string; error?: { message?: string } }
  if (json.error?.message) throw new Error(json.error.message)
  const r = json.result
  if (typeof r !== "string" || !r.startsWith("0x") || r.length <= 2) return BigInt(0)
  return hexToBigInt(r)
}

/** Generic `eth_call` — `data` is hex-encoded calldata (e.g. `0xfeaf968c` + args). */
export async function ethCall(rpcUrl: string, to: string, data: `0x${string}`): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = (await res.json()) as { result?: string; error?: { message?: string } }
  if (json.error?.message) throw new Error(json.error.message)
  const r = json.result
  if (typeof r !== "string" || !r.startsWith("0x")) {
    throw new Error("eth_call returned empty result")
  }
  return r
}
