/**
 * Canonical chain ids for Rombo ↔ Uniswap / Privy integrations.
 * UI agent config uses string slugs (`AgentConfig.chain`); map here for APIs.
 *
 * Verify against [Uniswap supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains) before mainnet cutover.
 */

export type RomboChainSlug =
  | "base-sepolia"
  | "base-mainnet"
  | "unichain-sepolia"
  | "unichain-mainnet"

/** viem-style numeric chain ids */
export const CHAIN_ID_BY_SLUG: Record<RomboChainSlug, number> = {
  "base-sepolia": 84532,
  "base-mainnet": 8453,
  "unichain-sepolia": 1301,
  "unichain-mainnet": 130,
}

export const SLUG_BY_CHAIN_ID: Partial<Record<number, RomboChainSlug>> = {
  84532: "base-sepolia",
  8453: "base-mainnet",
  1301: "unichain-sepolia",
  130: "unichain-mainnet",
}

/** Default slug matched to `DEFAULT_AGENT_CONFIG.chain` and testnet-first roadmap. */
export const DEFAULT_ROMBO_CHAIN_SLUG: RomboChainSlug = "base-sepolia"

export function chainIdFromSlug(slug: string): number | undefined {
  return CHAIN_ID_BY_SLUG[slug as RomboChainSlug]
}

export function slugFromChainId(chainId: number): RomboChainSlug | undefined {
  return SLUG_BY_CHAIN_ID[chainId]
}
