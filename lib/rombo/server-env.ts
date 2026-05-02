import { z } from "zod"
import {
  DEFAULT_ROMBO_CHAIN_SLUG,
  slugFromChainId,
  type RomboChainSlug,
} from "@/lib/rombo/chain-config"
import {
  DEFAULT_AGENT_WALLET_MODEL,
  parseRomboAgentWalletModel,
  type RomboAgentWalletModel,
} from "@/lib/rombo/wallet-model"

/**
 * Server-only environment for Privy + Uniswap backends.
 * Import only from Route Handlers, Server Actions, or `server` components — never from client bundles.
 */

const schema = z.object({
  /** MongoDB connection string (Atlas or self-hosted). Server-only. */
  MONGODB_URI: z.string().min(1).optional(),
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  /** Privy Wallet API authorization private key (Model 1 agent wallets). Never ship to client. */
  PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY: z.string().min(1).optional(),
  /** Comma-separated Privy policy IDs (first id used where API allows one policy per wallet). */
  PRIVY_DEFAULT_POLICY_IDS: z.string().optional(),
  UNISWAP_API_KEY: z.string().min(1).optional(),
  ROMBO_TARGET_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ROMBO_DEFAULT_CHAIN_ID: z.coerce.number().int().positive().optional(),
  ROMBO_AGENT_WALLET_MODEL: z.string().optional(),
})

export type RomboServerEnv = {
  targetNetwork: "testnet" | "mainnet"
  /** Numeric chain id for default Trading/LP calls when agent-specific chain not passed */
  defaultChainId: number
  agentWalletModel: RomboAgentWalletModel
  mongodbUri?: string
  privyAppId?: string
  privyAppSecret?: string
  privyWalletAuthorizationPrivateKey?: string
  /** Parsed from `PRIVY_DEFAULT_POLICY_IDS` — attach to embedded + agent wallets when set. */
  privyDefaultPolicyIds: string[]
  uniswapApiKey?: string
  /** True when `MONGODB_URI` is set (persist users, agents sync, txs, etc.). */
  hasMongo: boolean
  /** True when Privy app credentials are present (embedded login path). */
  hasPrivyApp: boolean
  /** True when authorization key is present (server signing for agent wallets). */
  hasPrivyWalletAuthz: boolean
  /** True when Uniswap Trading/LP calls can be authenticated. */
  hasUniswap: boolean
}

function chainIdForTarget(network: "testnet" | "mainnet", explicit?: number): number {
  if (explicit && Number.isFinite(explicit)) return explicit
  return network === "mainnet"
    ? 8453 // Base mainnet — align with prod; override via ROMBO_DEFAULT_CHAIN_ID
    : 84532 // Base Sepolia
}

export function getRomboServerEnv(): RomboServerEnv {
  const parsed = schema.safeParse(process.env)
  const data = parsed.success ? parsed.data : { ROMBO_TARGET_NETWORK: "testnet" as const }

  const targetNetwork = data.ROMBO_TARGET_NETWORK ?? "testnet"
  const defaultChainId = chainIdForTarget(
    targetNetwork,
    data.ROMBO_DEFAULT_CHAIN_ID,
  )
  const agentWalletModel = parseRomboAgentWalletModel(data.ROMBO_AGENT_WALLET_MODEL)

  const mongodbUri = data.MONGODB_URI
  const privyAppId = data.PRIVY_APP_ID
  const privyAppSecret = data.PRIVY_APP_SECRET
  const privyWalletAuthorizationPrivateKey = data.PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY
  const privyDefaultPolicyIds =
    data.PRIVY_DEFAULT_POLICY_IDS?.split(",")
      .map(s => s.trim())
      .filter(Boolean) ?? []
  const uniswapApiKey = data.UNISWAP_API_KEY

  return {
    targetNetwork,
    defaultChainId,
    agentWalletModel,
    mongodbUri,
    privyAppId,
    privyAppSecret,
    privyWalletAuthorizationPrivateKey,
    privyDefaultPolicyIds,
    uniswapApiKey,
    hasMongo: Boolean(mongodbUri),
    hasPrivyApp: Boolean(privyAppId && privyAppSecret),
    hasPrivyWalletAuthz: Boolean(privyWalletAuthorizationPrivateKey),
    hasUniswap: Boolean(uniswapApiKey),
  }
}

/** Slug aligned with `ROMBO_DEFAULT_CHAIN_ID` / target network when set. */
export function defaultRomboChainSlugFromEnv(): RomboChainSlug {
  const { defaultChainId } = getRomboServerEnv()
  return slugFromChainId(defaultChainId) ?? DEFAULT_ROMBO_CHAIN_SLUG
}
