/**
 * How each Rumble agent relates to Privy wallets — see `docs/ARCHITECTURE_DECISIONS.md`.
 */

export const RUMBLE_AGENT_WALLET_MODELS = ["agentic_per_agent", "user_scoped_signer"] as const

export type RumbleAgentWalletModel = (typeof RUMBLE_AGENT_WALLET_MODELS)[number]

/** Privy “Model 1” — developer-held authorization keys + policies per agent wallet. */
export const DEFAULT_AGENT_WALLET_MODEL: RumbleAgentWalletModel = "agentic_per_agent"

export function parseRumbleAgentWalletModel(raw: string | undefined): RumbleAgentWalletModel {
  const v = raw?.trim().toLowerCase()
  if (v === "user_scoped_signer") return "user_scoped_signer"
  return DEFAULT_AGENT_WALLET_MODEL
}
