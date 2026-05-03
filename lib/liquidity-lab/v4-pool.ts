import type { Address, Hex, PublicClient } from "viem"
import { concat, encodeAbiParameters, keccak256, pad, parseAbi } from "viem"

/** Uniswap v4 “native ETH” currency in PoolKey / Liquidity API. */
export const V4_NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000" as const satisfies Address

/** No-hooks pool key (Liquidity `newPool.hooks` on V4). */
export const V4_NO_HOOKS = "0x0000000000000000000000000000000000000000" as const satisfies Address

/** Official PoolManager deployments — Base & Base Sepolia. */
export const V4_POOL_MANAGER: Partial<Record<number, Address>> = {
  8453: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  84532: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
}

/** `StateLibrary.POOLS_SLOT` — index of the `pools` mapping in PoolManager storage. */
const POOLS_SLOT = pad("0x06", { size: 32 })

const extsloadAbi = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
])

export function v4TickSpacingForSwapFee(fee: number): number {
  if (fee === 100) return 1
  if (fee === 500) return 10
  if (fee === 3000) return 60
  if (fee === 10000) return 200
  return 10
}

/** Sort v4 currencies so `currency0 < currency1` (required by the protocol). */
export function sortV4Currencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

/**
 * PoolId = keccak256(abi.encode(PoolKey)) per Uniswap v4 core.
 * Matches the official Liquidity API example for Base native ETH + USDC.
 */
export function computeV4PoolId(input: {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks?: Address
}): Hex {
  const hooks = input.hooks ?? V4_NO_HOOKS
  const packed = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [input.currency0, input.currency1, input.fee, input.tickSpacing, hooks],
  )
  return keccak256(packed)
}

function poolStateRootSlot(poolId: Hex): Hex {
  return keccak256(concat([poolId, POOLS_SLOT]))
}

/** Decode `Pool.State.slot0` word returned from `extsload` at the pool state root slot. */
export function decodeV4Slot0Word(word: Hex): {
  sqrtPriceX96: bigint
  tick: number
  protocolFee: number
  lpFee: number
} {
  const w = BigInt(word)
  const mask160 = (BigInt(1) << BigInt(160)) - BigInt(1)
  const sqrtPriceX96 = w & mask160
  const tickU24 = Number((w >> BigInt(160)) & BigInt(0xffffff))
  const tick = tickU24 >= 0x800000 ? tickU24 - 0x1000000 : tickU24
  const protocolFee = Number((w >> BigInt(184)) & BigInt(0xffffff))
  const lpFee = Number((w >> BigInt(208)) & BigInt(0xffffff))
  return { sqrtPriceX96, tick, protocolFee, lpFee }
}

export async function readV4PoolSlot0(input: {
  publicClient: PublicClient
  chainId: number
  poolId: Hex
}): Promise<
  | { ok: true; sqrtPriceX96: bigint; tick: number }
  | { ok: false; reason: "no_pool_manager" | "pool_not_initialized" }
> {
  const manager = V4_POOL_MANAGER[input.chainId]
  if (!manager) {
    return { ok: false, reason: "no_pool_manager" }
  }
  const slot = poolStateRootSlot(input.poolId)
  const data = (await input.publicClient.readContract({
    address: manager,
    abi: extsloadAbi,
    functionName: "extsload",
    args: [slot],
  })) as Hex

  const { sqrtPriceX96, tick } = decodeV4Slot0Word(data)
  if (sqrtPriceX96 === BigInt(0)) {
    return { ok: false, reason: "pool_not_initialized" }
  }
  return { ok: true, sqrtPriceX96, tick }
}
