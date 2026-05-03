import "server-only"

import type { Address } from "viem"
import {
  buildLabPoolId,
  formatLabPoolLabel,
  isNativeV4Address,
  V4_NATIVE_ADDRESS,
} from "@/lib/agents/lab-pools"
import { upsertLabPool } from "@/lib/db/lab-pools.repo"
import { erc20DecimalsOnChain, erc20SymbolOnChain } from "@/lib/onchain/erc20-meta"
import {
  computeV4PoolId,
  v4TickSpacingForSwapFee,
} from "@/lib/liquidity-lab/v4-pool"
import { resolveAgentRuntimeRpcUrl } from "@/lib/rombo/json-rpc"
import { slugFromChainId, type RomboChainSlug } from "@/lib/rombo/chain-config"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

type NewPoolPayload = {
  token0Address?: string
  token1Address?: string
  token_0_address?: string
  token_1_address?: string
  fee?: number | string
  tickSpacing?: number | string
  tick_spacing?: number | string
  hooks?: string
}

function readString(o: Record<string, unknown>, a: string, b?: string): string | undefined {
  const x = o[a]
  if (typeof x === "string") return x
  if (b) {
    const y = o[b]
    if (typeof y === "string") return y
  }
  return undefined
}

function readNumber(o: Record<string, unknown>, a: string, b?: string): number | undefined {
  const x = o[a]
  if (typeof x === "number" && Number.isFinite(x)) return x
  if (typeof x === "string") {
    const n = Number.parseFloat(x)
    if (Number.isFinite(n)) return n
  }
  if (b) return readNumber(o, b)
  return undefined
}

async function resolveTokenMeta(input: {
  rpcUrl: string
  address: string
}): Promise<{ address: string; symbol: string; decimals: number; isNative: boolean } | undefined> {
  if (isNativeV4Address(input.address)) {
    return { address: V4_NATIVE_ADDRESS, symbol: "ETH", decimals: 18, isNative: true }
  }
  const [decimals, symbol] = await Promise.all([
    erc20DecimalsOnChain(input.rpcUrl, input.address),
    erc20SymbolOnChain(input.rpcUrl, input.address),
  ])
  if (decimals === undefined || !symbol) return undefined
  return { address: input.address.toLowerCase(), symbol, decimals, isNative: false }
}

/**
 * Auto-register a user-deployed v4 pool in the `lab_pools` registry when a
 * `/lp/create` call with a `newPool` block succeeds. No-op for existing-pool
 * creates, non-V4 protocols, or payloads we can't reason about.
 */
export async function maybePersistLabPoolFromNewPoolCreate(input: {
  romboUserIdHex?: string
  action: string
  payload: Record<string, unknown>
  response: unknown
}): Promise<void> {
  if (input.action !== "create") return
  if (!input.romboUserIdHex) return

  const protocol = typeof input.payload.protocol === "string" ? input.payload.protocol : undefined
  if (protocol !== "V4") return

  const np = input.payload.newPool as NewPoolPayload | undefined
  if (!np || typeof np !== "object") return

  const chainId = readNumber(input.payload, "chainId", "chain_id")
  if (chainId === undefined) return
  const chainSlug = slugFromChainId(chainId) as RomboChainSlug | undefined
  if (!chainSlug) return

  const token0Address =
    readString(np as unknown as Record<string, unknown>, "token0Address", "token_0_address")?.toLowerCase()
  const token1Address =
    readString(np as unknown as Record<string, unknown>, "token1Address", "token_1_address")?.toLowerCase()
  if (!token0Address || !token1Address) return

  const fee = readNumber(np as unknown as Record<string, unknown>, "fee")
  if (fee === undefined) return
  const tickSpacing =
    readNumber(np as unknown as Record<string, unknown>, "tickSpacing", "tick_spacing") ??
    v4TickSpacingForSwapFee(fee)
  const hooks = (
    readString(np as unknown as Record<string, unknown>, "hooks") ?? V4_NATIVE_ADDRESS
  ).toLowerCase()

  let rpcUrl: string
  try {
    rpcUrl = resolveAgentRuntimeRpcUrl(chainId, getRomboServerEnv().romboRpcUrl)
  } catch {
    return
  }

  const [token0, token1] = await Promise.all([
    resolveTokenMeta({ rpcUrl, address: token0Address }),
    resolveTokenMeta({ rpcUrl, address: token1Address }),
  ])
  if (!token0 || !token1) return

  const v4PoolId = computeV4PoolId({
    currency0: token0.address as Address,
    currency1: token1.address as Address,
    fee,
    tickSpacing,
    hooks: hooks as Address,
  })

  const labPoolId = buildLabPoolId(chainSlug, v4PoolId)
  const label = formatLabPoolLabel({
    token0Symbol: token0.symbol,
    token1Symbol: token1.symbol,
    feePpm: fee,
  })

  await upsertLabPool({
    labPoolId,
    romboUserIdHex: input.romboUserIdHex,
    chainSlug,
    chainId,
    protocol: "V4",
    fee,
    tickSpacing,
    hooks,
    token0,
    token1,
    v4PoolId,
    label,
  })
}
