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

/** Drop invalid URLs instead of failing the whole env parse (common mistake: subgraph id vs full gateway URL). */
function sanitizeOptionalHttpUrl(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== "string") return undefined
  const s = raw.trim()
  if (!s) return undefined
  try {
    const u = new URL(s)
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined
    return s
  } catch {
    return undefined
  }
}

/**
 * The Graph decentralized gateway expects:
 * `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>`
 * If the URL is missing the key segment (`/api/subgraphs/id/...`), inject `THE_GRAPH_API_KEY`.
 * @see https://thegraph.com/docs/en/subgraphs/querying/querying-the-graph/
 */
function injectTheGraphGatewayApiKey(url: string | undefined, apiKey: string | undefined): string | undefined {
  if (!url?.trim()) return undefined
  const trimmed = url.trim()
  if (!apiKey?.trim()) return trimmed
  try {
    const u = new URL(trimmed)
    const host = u.hostname.toLowerCase()
    if (host !== "gateway.thegraph.com" && host !== "www.gateway.thegraph.com") return trimmed
    const segs = u.pathname.split("/").filter(Boolean)
    if (
      segs.length >= 4 &&
      segs[0] === "api" &&
      segs[1] === "subgraphs" &&
      segs[2] === "id" &&
      segs[3]
    ) {
      const subgraphId = segs[3]
      u.pathname = `/api/${apiKey.trim()}/subgraphs/id/${subgraphId}`
      return u.toString()
    }
  } catch {
    return trimmed
  }
  return trimmed
}

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
  UNISWAP_LIQUIDITY_API_BASE: z.string().optional(),
  /** Trading API — must stay consistent across `/quote` + `/swap`. Default `2.0`. */
  UNISWAP_UNIVERSAL_ROUTER_VERSION: z.string().min(1).optional(),
  /** Optional product hint for IL / rebalance guardrails (Privy policy ids still come from `PRIVY_DEFAULT_POLICY_IDS`). */
  ROMBO_LP_REBALANCE_POLICY: z.string().optional(),
  /** GraphQL HTTP endpoint for Uniswap V3–style pool stats (chain-specific; see Uniswap / Goldsky docs). */
  UNISWAP_V3_SUBGRAPH_URL: z.string().optional(),
  /** The Graph Studio API key — inserted into `gateway.thegraph.com` URLs when the URL omits `/api/<key>/`. */
  THE_GRAPH_API_KEY: z.string().optional(),
  /** Shared secret for `POST /api/indexer/webhook` (`x-rombo-webhook-secret`). */
  ROMBO_INDEXER_WEBHOOK_SECRET: z.string().optional(),
  /** Shared secret gate for `/api/cron/*` (`x-rombo-cron-secret` or `?token=`). */
  ROMBO_CRON_SECRET: z.string().optional(),
  /** Hard cap on how long a cached pool price may serve clients (seconds). */
  ROMBO_POOL_PRICE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  /**
   * JSON-RPC URL for `eth_getTransactionReceipt` (receipt poller). If unset, public
   * defaults for Base / Base Sepolia are used (rate-limited; set your own in prod).
   */
  ROMBO_RPC_URL: z.string().optional(),
  /** See `executeAgentSwaps` — omit or `true` to broadcast swaps; set `false` to quote-only ticks. */
  ROMBO_AGENT_RUNTIME_EXECUTE_SWAPS: z.string().optional(),
  /** Optional ETH/USD anchor for metrics gas USD when subgraph cache is cold. */
  ROMBO_ETH_USD_REF: z.coerce.number().positive().optional(),
  ROMBO_TARGET_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ROMBO_DEFAULT_CHAIN_ID: z.coerce.number().int().positive().optional(),
  ROMBO_AGENT_WALLET_MODEL: z.string().optional(),
  /** OpenAI — server tick uses the model to pick a price box when set (see `lib/agents/runtime/llm-evaluate.ts`). */
  OPENAI_API_KEY: z.string().optional(),
  /** Default `gpt-4o-mini`. */
  ROMBO_OPENAI_MODEL: z.string().optional(),
  /** Set to `false` to use rule-based box matching only. */
  ROMBO_LLM_AGENT_ENABLED: z.string().optional(),
  /** When not `false`, arena spot USD prefers Chainlink feeds on Base / Base Sepolia (`lib/onchain/chainlink-feeds.ts`). */
  ROMBO_CHAINLINK_SPOT_ENABLED: z.string().optional(),
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
  /** When set, `/api/cron/*` requires `x-rombo-cron-secret` header. */
  cronSecret?: string
  /** TTL for cached live pool prices (seconds, default 60). */
  poolPriceTtlSeconds: number
  hasSubgraph: boolean
  hasIndexerWebhook: boolean
  hasCronSecret: boolean
  /** Optional JSON-RPC URL override for receipt polling / verification. */
  romboRpcUrl?: string
  /** False disables Privy broadcast after Uniswap `/swap` build (quotes + runs still logged). */
  executeAgentSwaps: boolean
  /** Explicit ETH/USD for metrics when pool cache unavailable. */
  romboEthUsdRef?: number
  /** When set and LLM not disabled, agent tick may consult OpenAI for box selection. */
  openAiApiKey?: string
  openAiModel: string
  llmAgentEnabled: boolean
  /** Default true — spot prices use Chainlink when RPC + chain feeds exist. */
  chainlinkSpotEnabled: boolean
}

function chainIdForTarget(network: "testnet" | "mainnet", explicit?: number): number {
  if (explicit && Number.isFinite(explicit)) return explicit
  return network === "mainnet"
    ? 8453 // Base mainnet — align with prod; override via ROMBO_DEFAULT_CHAIN_ID
    : 84532 // Base Sepolia
}

export function getRomboServerEnv(): RomboServerEnv {
  const parsed = schema.safeParse(process.env)
  const data = parsed.success
    ? parsed.data
    : {
        ROMBO_TARGET_NETWORK: "testnet" as const,
        ROMBO_AGENT_RUNTIME_EXECUTE_SWAPS: undefined as string | undefined,
        ROMBO_RPC_URL: undefined as string | undefined,
        ROMBO_CHAINLINK_SPOT_ENABLED: undefined as string | undefined,
      }

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
    sanitizeOptionalHttpUrl(data.UNISWAP_LIQUIDITY_API_BASE) || DEFAULT_UNISWAP_LIQUIDITY_API_BASE
  const romboLpRebalancePolicy = data.ROMBO_LP_REBALANCE_POLICY?.trim()
  const uniswapV3SubgraphUrl = injectTheGraphGatewayApiKey(
    sanitizeOptionalHttpUrl(data.UNISWAP_V3_SUBGRAPH_URL),
    data.THE_GRAPH_API_KEY?.trim(),
  )
  const indexerWebhookSecret = data.ROMBO_INDEXER_WEBHOOK_SECRET?.trim()
  const cronSecret = data.ROMBO_CRON_SECRET?.trim()
  const poolPriceTtlSeconds = data.ROMBO_POOL_PRICE_TTL_SECONDS ?? 60
  const uniswapUniversalRouterVersion = data.UNISWAP_UNIVERSAL_ROUTER_VERSION ?? "2.0"
  const romboRpcUrl = sanitizeOptionalHttpUrl(data.ROMBO_RPC_URL)
  const executeAgentSwaps = data.ROMBO_AGENT_RUNTIME_EXECUTE_SWAPS?.trim() !== "false"
  const romboEthUsdRef = data.ROMBO_ETH_USD_REF
  const openAiApiKey = data.OPENAI_API_KEY?.trim()
  const openAiModel = data.ROMBO_OPENAI_MODEL?.trim() || "gpt-4o-mini"
  const llmAgentEnabled =
    Boolean(openAiApiKey) && data.ROMBO_LLM_AGENT_ENABLED?.trim().toLowerCase() !== "false"
  const chainlinkSpotEnabled =
    data.ROMBO_CHAINLINK_SPOT_ENABLED?.trim().toLowerCase() !== "false"

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
    cronSecret,
    poolPriceTtlSeconds,
    uniswapUniversalRouterVersion,
    hasMongo: Boolean(mongodbUri),
    hasPrivyApp: Boolean(privyAppId && privyAppSecret),
    hasPrivyWalletAuthz: Boolean(privyWalletAuthorizationPrivateKey),
    hasUniswap: Boolean(uniswapApiKey),
    hasSubgraph: Boolean(uniswapV3SubgraphUrl),
    hasIndexerWebhook: Boolean(indexerWebhookSecret),
    hasCronSecret: Boolean(cronSecret),
    romboRpcUrl,
    executeAgentSwaps,
    romboEthUsdRef,
    openAiApiKey,
    openAiModel,
    llmAgentEnabled,
    chainlinkSpotEnabled,
  }
}

/** Slug aligned with `ROMBO_DEFAULT_CHAIN_ID` / target network when set. */
export function defaultRomboChainSlugFromEnv(): RomboChainSlug {
  const { defaultChainId } = getRomboServerEnv()
  return slugFromChainId(defaultChainId) ?? DEFAULT_ROMBO_CHAIN_SLUG
}
