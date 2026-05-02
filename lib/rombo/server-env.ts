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
import { DEFAULT_UNISWAP_LIQUIDITY_API_BASE } from "@/lib/integrations/uniswap/constants"

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
  /** Liquidity API base URL (no path). Defaults to `DEFAULT_UNISWAP_LIQUIDITY_API_BASE`. */
  UNISWAP_LIQUIDITY_API_BASE: z.string().url().optional(),
  /** Trading API — must stay consistent across `/quote` + `/swap`. Default `2.0`. */
  UNISWAP_UNIVERSAL_ROUTER_VERSION: z.string().min(1).optional(),
  /** Optional product hint for IL / rebalance guardrails (Privy policy ids still come from `PRIVY_DEFAULT_POLICY_IDS`). */
  ROMBO_LP_REBALANCE_POLICY: z.string().optional(),
  /** GraphQL HTTP endpoint for Uniswap V3–style pool stats (chain-specific; see Uniswap / Goldsky docs). */
  UNISWAP_V3_SUBGRAPH_URL: z.string().url().optional(),
  /** Shared secret for `POST /api/indexer/webhook` (`x-rombo-webhook-secret`). */
  ROMBO_INDEXER_WEBHOOK_SECRET: z.string().optional(),
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
  /** Base URL for Liquidity API (`/lp/*`). Shares rate limit budget with Trading via `fetchUniswap`. */
  liquidityApiBase: string
  /** Optional raw env string for LP rebalance / IL policy hints (see `lib/liquidity/lp-policies.ts`). */
  romboLpRebalancePolicy?: string
  /** Universal Router version header for Trading API (`x-universal-router-version`). */
  uniswapUniversalRouterVersion: string
  /** True when `MONGODB_URI` is set (persist users, agents sync, txs, etc.). */
  hasMongo: boolean
  /** True when Privy app credentials are present (embedded login path). */
  hasPrivyApp: boolean
  /** True when authorization key is present (server signing for agent wallets). */
  hasPrivyWalletAuthz: boolean
  /** True when Uniswap Trading/LP calls can be authenticated. */
  hasUniswap: boolean
  /** Optional Uniswap V3 subgraph URL for TVL / volume / fee indexing. */
  uniswapV3SubgraphUrl?: string
  /** When set, secured indexer webhooks can be accepted. */
  indexerWebhookSecret?: string
  hasSubgraph: boolean
  hasIndexerWebhook: boolean
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
  const liquidityApiBase =
    data.UNISWAP_LIQUIDITY_API_BASE?.trim() || DEFAULT_UNISWAP_LIQUIDITY_API_BASE
  const romboLpRebalancePolicy = data.ROMBO_LP_REBALANCE_POLICY?.trim()
  const uniswapV3SubgraphUrl = data.UNISWAP_V3_SUBGRAPH_URL?.trim()
  const indexerWebhookSecret = data.ROMBO_INDEXER_WEBHOOK_SECRET?.trim()
  const uniswapUniversalRouterVersion = data.UNISWAP_UNIVERSAL_ROUTER_VERSION ?? "2.0"

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
    liquidityApiBase,
    romboLpRebalancePolicy,
    uniswapV3SubgraphUrl,
    indexerWebhookSecret,
    uniswapUniversalRouterVersion,
    hasMongo: Boolean(mongodbUri),
    hasPrivyApp: Boolean(privyAppId && privyAppSecret),
    hasPrivyWalletAuthz: Boolean(privyWalletAuthorizationPrivateKey),
    hasUniswap: Boolean(uniswapApiKey),
    hasSubgraph: Boolean(uniswapV3SubgraphUrl),
    hasIndexerWebhook: Boolean(indexerWebhookSecret),
  }
}

/** Slug aligned with `ROMBO_DEFAULT_CHAIN_ID` / target network when set. */
export function defaultRomboChainSlugFromEnv(): RomboChainSlug {
  const { defaultChainId } = getRomboServerEnv()
  return slugFromChainId(defaultChainId) ?? DEFAULT_ROMBO_CHAIN_SLUG
}
