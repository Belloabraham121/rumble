import "server-only"

import type { Address, Hex } from "viem"
import { concat, keccak256, pad } from "viem"
import type { AgentConfig } from "@/lib/agents/agent-types"
import {
  buildLabPoolId,
  isNativeV4Address,
  looksLikeUsdStable,
  type LabPoolDef,
} from "@/lib/agents/lab-pools"
import {
  decisionForMatchedLabBox,
  type RuntimeDecision,
  type SwapArenaDirection,
} from "@/lib/agents/runtime/evaluate-boxes"
import { readUsdFeed } from "@/lib/onchain/chainlink-feeds"
import { decodeV4Slot0Word, V4_POOL_MANAGER } from "@/lib/liquidity-lab/v4-pool"
import { ethCall, resolveAgentRuntimeRpcUrl } from "@/lib/rumble/json-rpc"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import type { PriceBox } from "@/components/dashboard/types"

const ETH_USD_FEEDS: Record<number, Address> = {
  8453: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  84532: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
}

/** `StateLibrary.POOLS_SLOT` — same constant as `lib/liquidity-lab/v4-pool.ts`. */
const POOLS_SLOT = pad("0x06", { size: 32 })

/** `extsload(bytes32)` selector. */
const EXTSLOAD_SELECTOR = "0x9bf6645f"

function poolStateRootSlot(v4PoolId: Hex): Hex {
  return keccak256(concat([v4PoolId, POOLS_SLOT]))
}

async function readV4Slot0ViaRpc(input: {
  rpcUrl: string
  poolManager: Address
  v4PoolId: Hex
}): Promise<{ sqrtPriceX96: bigint; tick: number } | null> {
  const slot = poolStateRootSlot(input.v4PoolId)
  const raw = slot.startsWith("0x") ? slot.slice(2) : slot
  const data = (EXTSLOAD_SELECTOR + raw) as Hex
  try {
    const word = (await ethCall(input.rpcUrl, input.poolManager, data)) as Hex
    const { sqrtPriceX96, tick } = decodeV4Slot0Word(word)
    if (sqrtPriceX96 === BigInt(0)) return null
    return { sqrtPriceX96, tick }
  } catch {
    return null
  }
}

/** `price = (sqrtPriceX96 / 2^96)^2 * 10^(d0 - d1)` — token1 per token0 in human units. */
function humanPriceToken1PerToken0(
  sqrtPriceX96: bigint,
  dec0: number,
  dec1: number,
): number {
  const Q96 = Math.pow(2, 96)
  const sqrt = Number(sqrtPriceX96) / Q96
  if (!Number.isFinite(sqrt) || sqrt <= 0) return 0
  const raw = sqrt * sqrt
  return raw * Math.pow(10, dec0 - dec1)
}

export type LabPoolPrice = {
  /** USD "display" price used to match against price boxes. */
  displayUsd: number
  /** Reason when we can't price this pool. */
  reason?: string
}

/**
 * Live USD mark for a lab pool:
 * 1. Read v4 `slot0.sqrtPriceX96` from the PoolManager (`extsload`).
 * 2. Derive human `token1 / token0` price using each side's decimals.
 * 3. Map to USD using the side that looks like a USD stable, or the native-ETH
 *    side crossed with a Chainlink ETH/USD feed.
 */
export async function resolveLabPoolDisplayUsd(
  labPool: LabPoolDef,
): Promise<LabPoolPrice | null> {
  const manager = V4_POOL_MANAGER[labPool.chainId]
  if (!manager) return { displayUsd: 0, reason: "no_pool_manager" }

  let rpcUrl: string
  try {
    rpcUrl = resolveAgentRuntimeRpcUrl(labPool.chainId, getRumbleServerEnv().rumbleRpcUrl)
  } catch {
    return { displayUsd: 0, reason: "no_rpc_url" }
  }

  const slot = await readV4Slot0ViaRpc({
    rpcUrl,
    poolManager: manager,
    v4PoolId: labPool.v4PoolId as Hex,
  })
  if (!slot) return { displayUsd: 0, reason: "pool_not_initialized" }

  const humanPrice = humanPriceToken1PerToken0(
    slot.sqrtPriceX96,
    labPool.token0.decimals,
    labPool.token1.decimals,
  )
  if (!Number.isFinite(humanPrice) || humanPrice <= 0) {
    return { displayUsd: 0, reason: "bad_sqrt_price" }
  }

  const token0Stable = looksLikeUsdStable(labPool.token0.symbol)
  const token1Stable = looksLikeUsdStable(labPool.token1.symbol)
  const token0Native = labPool.token0.isNative || isNativeV4Address(labPool.token0.address)
  const token1Native = labPool.token1.isNative || isNativeV4Address(labPool.token1.address)

  if (token1Stable && !token0Stable) return { displayUsd: humanPrice }
  if (token0Stable && !token1Stable) return { displayUsd: 1 / humanPrice }
  if (token0Stable && token1Stable) return { displayUsd: humanPrice }

  const ethFeed = ETH_USD_FEEDS[labPool.chainId]
  if (ethFeed) {
    const eth = await readUsdFeed(rpcUrl, ethFeed)
    if (eth && eth.priceUsd > 0) {
      if (token0Native) return { displayUsd: humanPrice * eth.priceUsd }
      if (token1Native) return { displayUsd: (1 / humanPrice) * eth.priceUsd }
    }
  }

  return { displayUsd: 0, reason: "no_usd_bridge" }
}

/** Pick the swap direction that sells the approved side of a lab pool. */
function swapDirectionForLabPool(
  labPool: LabPoolDef,
  config: AgentConfig,
): SwapArenaDirection {
  const approved = new Set(
    config.approvedTokens
      .split(",")
      .map(x => x.trim().toUpperCase())
      .filter(Boolean),
  )
  if (approved.has(labPool.token0.symbol.toUpperCase())) return "token0_to_token1"
  if (approved.has(labPool.token1.symbol.toUpperCase())) return "token1_to_token0"
  if (labPool.token1.isNative) return "token0_to_token1"
  if (labPool.token0.isNative) return "token1_to_token0"
  return "token0_to_token1"
}

export async function evaluateLabPoolRuntimeDecision(input: {
  labPool: LabPoolDef
  boxes: PriceBox[]
  config: AgentConfig
}): Promise<{
  decision: RuntimeDecision
  displayUsd?: number
  reason?: string
}> {
  if (!input.config.enabledLabPoolIds.includes(input.labPool.labPoolId)) {
    return { decision: { type: "skip", reason: "lab_pool_not_enabled" } }
  }

  const price = await resolveLabPoolDisplayUsd(input.labPool)
  if (!price || price.displayUsd <= 0) {
    return {
      decision: { type: "skip", reason: `lab_no_price${price?.reason ? `:${price.reason}` : ""}` },
      reason: price?.reason,
    }
  }

  /** Lab-pool boxes treat `low`/`high` as **direct USD** values (no arena chart-coord mapping). */
  const ordered = [...input.boxes].sort((a, b) => a.low - b.low)
  const hit = ordered.find(b => price.displayUsd >= b.low && price.displayUsd <= b.high)
  if (!hit) {
    return { decision: { type: "skip", reason: "no_box_hit" }, displayUsd: price.displayUsd }
  }

  const direction = swapDirectionForLabPool(input.labPool, input.config)
  return {
    decision: decisionForMatchedLabBox(hit, input.labPool, input.config, direction),
    displayUsd: price.displayUsd,
  }
}

export { buildLabPoolId }
