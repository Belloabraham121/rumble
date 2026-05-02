/**
 * How each Rombo agent relates to Privy wallets — see `docs/ARCHITECTURE_DECISIONS.md`.
 */

export const ROMBO_AGENT_WALLET_MODELS = ["agentic_per_agent", "user_scoped_signer"] as const

export type RomboAgentWalletModel = (typeof ROMBO_AGENT_WALLET_MODELS)[number]

/** Privy “Model 1” — developer-held authorization keys + policies per agent wallet. */
export const DEFAULT_AGENT_WALLET_MODEL: RomboAgentWalletModel = "agentic_per_agent"

export function parseRomboAgentWalletModel(raw: string | undefined): RomboAgentWalletModel {
  const v = raw?.trim().toLowerCase()
  if (v === "user_scoped_signer") return "user_scoped_signer"
  return DEFAULT_AGENT_WALLET_MODEL
}
