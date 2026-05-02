/**
 * Rombo arena pool → chain + Uniswap v3-style fee tier + token pair addresses.
 * Verify addresses on-chain before mainnet size; testnet mints differ by deployment.
 */

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { ARENA_POOL_BY_ID } from "@/lib/agents/arena-pools"
import {
  CHAIN_ID_BY_SLUG,
  type RomboChainSlug,
} from "@/lib/rombo/chain-config"

/** Uniswap v3 fee tier integers (hundredths of a bip); matches `feeTier` labels in UI. */
export function uniswapV3FeeTierFromLabel(feeLabel: string): number | undefined {
  const t = feeLabel.trim()
  if (t === "0.01%") return 100
  if (t === "0.05%") return 500
  if (t === "0.3%") return 3000
  if (t === "1%") return 10000
  return undefined
}

export type ArenaPoolOnChain = {
  arenaPoolId: ArenaPoolId
  chainSlug: RomboChainSlug
  chainId: number
  feeTier: number
  /** First token (lexicographically smaller address — matches Uniswap pool token0 convention when comparing addresses). */
  token0: { symbol: string; address: string }
  /** Second token */
  token1: { symbol: string; address: string }
  /** Human-readable pool key for logs */
  label: string
}

/** Per-chain token registry — keep in sync with `lib/integrations/uniswap/token-addresses.ts`. */
type PairTokens = { token0: ArenaPoolOnChain["token0"]; token1: ArenaPoolOnChain["token1"] }

const BASE_SEPOLIA_ETH_USDC: PairTokens = {
  token0: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
  },
  token1: {
    symbol: "USDC",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
}

const BASE_SEPOLIA_WBTC_ETH: PairTokens = {
  token0: {
    symbol: "WBTC",
    address: "0x16ca4dac32d5c3206b1be15876a08660e580a8b5",
  },
  token1: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
  },
}

const BASE_SEPOLIA_USDC_USDT: PairTokens = {
  token0: {
    symbol: "USDC",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  token1: {
    symbol: "USDT",
    address: "0x2d82c4b9ff582d02cc89675f2d086cb7953a555a",
  },
}

/** Base mainnet — production-oriented addresses (verify before trading size). */
const BASE_MAINNET_ETH_USDC: PairTokens = {
  token0: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
  token1: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
}

const BASE_MAINNET_WBTC_ETH: PairTokens = {
  token0: {
    symbol: "WBTC",
    /** Wrapped BTC on Base — verify on BaseScan before production volume */
    address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
  },
  token1: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
}

const BASE_MAINNET_USDC_USDT: PairTokens = {
  token0: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  token1: { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699f2c" },
}

function sortTokensForUniswapOrder(a: PairTokens["token0"], b: PairTokens["token1"]) {
  const addr = (t: { address: string }) => BigInt(t.address.toLowerCase())
  return addr(a) < addr(b)
    ? { token0: a, token1: b }
    : { token0: b, token1: a }
}

function buildPool(
  arenaPoolId: ArenaPoolId,
  chainSlug: RomboChainSlug,
  pair: PairTokens,
): ArenaPoolOnChain | undefined {
  const meta = ARENA_POOL_BY_ID[arenaPoolId]
  const fee = uniswapV3FeeTierFromLabel(meta.feeTier)
  const chainId = CHAIN_ID_BY_SLUG[chainSlug]
  if (!fee || !chainId) return undefined

  const sorted = sortTokensForUniswapOrder(pair.token0, pair.token1)
  return {
    arenaPoolId,
    chainSlug,
    chainId,
    feeTier: fee,
    token0: sorted.token0,
    token1: sorted.token1,
    label: meta.label,
  }
}

const MAP: Partial<Record<RomboChainSlug, Partial<Record<ArenaPoolId, ArenaPoolOnChain>>>> = {
  "base-sepolia": {
    "eth-usdc": buildPool("eth-usdc", "base-sepolia", BASE_SEPOLIA_ETH_USDC)!,
    "wbtc-eth": buildPool("wbtc-eth", "base-sepolia", BASE_SEPOLIA_WBTC_ETH)!,
    "usdc-usdt": buildPool("usdc-usdt", "base-sepolia", BASE_SEPOLIA_USDC_USDT)!,
  },
  "base-mainnet": {
    "eth-usdc": buildPool("eth-usdc", "base-mainnet", BASE_MAINNET_ETH_USDC)!,
    "wbtc-eth": buildPool("wbtc-eth", "base-mainnet", BASE_MAINNET_WBTC_ETH)!,
    "usdc-usdt": buildPool("usdc-usdt", "base-mainnet", BASE_MAINNET_USDC_USDT)!,
  },
}

/** Resolve canonical on-chain metadata for an arena pool on a Rombo chain slug. */
export function getArenaPoolOnChain(
  arenaPoolId: ArenaPoolId,
  chainSlug: string,
): ArenaPoolOnChain | undefined {
  return MAP[chainSlug as RomboChainSlug]?.[arenaPoolId]
}
