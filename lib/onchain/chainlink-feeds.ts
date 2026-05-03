import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { ethCall, resolveAgentRuntimeRpcUrl } from "@/lib/rombo/json-rpc"

/** AggregatorV3Interface.latestRoundData() — no args. */
const SELECTOR_LATEST_ROUND_DATA = "0xfeaf968c" as const

/** Base mainnet — Chainlink data feeds on Base (same addresses as `data.md`). */
const FEEDS_BASE_MAINNET = {
  ETH_USD: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  BTC_USD: "0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E",
} as const

/** Base Sepolia — testnet feeds (`data.md`). */
const FEEDS_BASE_SEPOLIA = {
  ETH_USD: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
  BTC_USD: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
} as const

function feedsForChain(chainId: number): typeof FEEDS_BASE_MAINNET | typeof FEEDS_BASE_SEPOLIA | null {
  if (chainId === 8453) return FEEDS_BASE_MAINNET
  if (chainId === 84532) return FEEDS_BASE_SEPOLIA
  return null
}

function decodeInt256Word(hex64: string): bigint {
  const raw = BigInt(`0x${hex64}`)
  const signThreshold = BigInt(
    "57896044618658097711785492504343953926634992332820282019728792003956564819968",
  )
  const mod = BigInt(
    "115792089237316195423570985008687907853269984665640564039457584007913129639936",
  )
  if (raw >= signThreshold) return raw - mod
  return raw
}

/** Decode `latestRoundData()` return blob (5 × 32-byte words). */
export function decodeAggregatorLatestRound(result: `0x${string}`): {
  answer: bigint
  updatedAtSec: bigint
} {
  const h = result.startsWith("0x") ? result.slice(2) : result
  if (h.length < 320) {
    throw new Error("aggregator return too short")
  }
  const answer = decodeInt256Word(h.slice(64, 128))
  const updatedAtSec = BigInt(`0x${h.slice(192, 256)}`)
  return { answer, updatedAtSec }
}

/** Chainlink USD feeds use 8 decimals for the answer. */
export function answerToUsd(answer: bigint): number {
  return Number(answer) / 1e8
}

export async function readUsdFeed(
  rpcUrl: string,
  feedAddress: string,
): Promise<{ priceUsd: number; updatedAtSec: number } | null> {
  try {
    const raw = (await ethCall(rpcUrl, feedAddress, SELECTOR_LATEST_ROUND_DATA)) as `0x${string}`
    const { answer, updatedAtSec } = decodeAggregatorLatestRound(raw)
    if (answer <= BigInt(0)) return null
    const priceUsd = answerToUsd(answer)
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
    return {
      priceUsd,
      updatedAtSec: Number(updatedAtSec),
    }
  } catch {
    return null
  }
}

export type ArenaChainlinkSpot = {
  displayUsd: string
  updatedAtSec: number
}

/**
 * Live spot USD for arena pairs via Chainlink — **not** pool TVL (see `data.md`).
 * - `eth-usdc` → ETH/USD
 * - `wbtc-eth` → BTC/USD (WBTC tracks BTC)
 * - `usdc-usdt` → synthetic peg `1` (no canonical stable/stable Chainlink feed in examples)
 */
export async function fetchArenaSpotUsdChainlink(input: {
  arenaPoolId: ArenaPoolId
  chainId: number
  rpcUrlOverride?: string
}): Promise<ArenaChainlinkSpot | null> {
  const feeds = feedsForChain(input.chainId)
  if (!feeds) return null

  if (input.arenaPoolId === "usdc-usdt") {
    return {
      displayUsd: "1",
      updatedAtSec: Math.floor(Date.now() / 1000),
    }
  }

  const rpcUrl = resolveAgentRuntimeRpcUrl(input.chainId, input.rpcUrlOverride)

  if (input.arenaPoolId === "eth-usdc") {
    const r = await readUsdFeed(rpcUrl, feeds.ETH_USD)
    if (!r) return null
    return { displayUsd: String(r.priceUsd), updatedAtSec: r.updatedAtSec }
  }

  if (input.arenaPoolId === "wbtc-eth") {
    const r = await readUsdFeed(rpcUrl, feeds.BTC_USD)
    if (!r) return null
    return { displayUsd: String(r.priceUsd), updatedAtSec: r.updatedAtSec }
  }

  return null
}
