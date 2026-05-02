/**
 * Known token addresses for Rumble chains — verify on-chain before mainnet funds.
 * Symbols are matched case-insensitively; `ETH` maps to wrapped native for ERC-20 swap paths.
 */

import type { RumbleChainSlug } from "@/lib/rumble/chain-config"

type TokenMap = Record<string, string>

/** Base Sepolia — common test tokens */
const BASE_SEPOLIA: TokenMap = {
  eth: "0x4200000000000000000000000000000000000006",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  wbtc: "0x16ca4dac32d5c3206b1be15876a08660e580a8b5",
  usdt: "0x2d82c4b9ff582d02cc89675f2d086cb7953a555a",
}

/** Base mainnet */
const BASE_MAINNET: TokenMap = {
  eth: "0x4200000000000000000000000000000000000006",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  wbtc: "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
  usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699f2c",
}

const BY_SLUG: Partial<Record<RumbleChainSlug, TokenMap>> = {
  "base-sepolia": BASE_SEPOLIA,
  "base-mainnet": BASE_MAINNET,
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/

/** Returns checksum-style address if `symbolOrAddress` is already hex, otherwise resolves symbol on chain. */
export function resolveTradingTokenAddress(
  chainSlug: string,
  symbolOrAddress: string,
): string | undefined {
  const s = symbolOrAddress.trim()
  if (ADDR_RE.test(s)) return s.toLowerCase()

  const map = BY_SLUG[chainSlug as RumbleChainSlug]
  if (!map) return undefined
  const key = s.toLowerCase().replace(/\s+/g, "")
  return map[key]
}
