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
