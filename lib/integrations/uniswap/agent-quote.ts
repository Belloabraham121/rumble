import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { LabPoolDef } from "@/lib/agents/lab-pools"
import type { AgentConfig } from "@/lib/agents/agent-types"
import { chainIdFromSlug } from "@/lib/rumble/chain-config"
import { resolveTradingTokenAddress } from "@/lib/integrations/uniswap/token-addresses"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"

/** Parse `AgentConfig.slippage` like `"0.5"` or `"0.5%"` into a Trading API percentage number. */
export function parseAgentSlippageTolerancePercent(slippage: string): number {
  const n = Number.parseFloat(slippage.replace("%", "").trim())
  if (!Number.isFinite(n) || n < 0) return 0.5
  return Math.min(n, 50)
}

export type BuildAgentQuoteBodyInput = {
  config: Pick<AgentConfig, "chain" | "slippage">
  /** Exact input amount in token base units (string integer). */
  amount: string
  swapper: string
  /** Symbols (`ETH`, `USDC`) or full `0x` addresses — omit when using `arenaPoolId` + `arenaDirection`. */
  tokenIn?: string
  tokenOut?: string
  /** Use canonical arena pool token addresses (`lib/trading/arena-pool-onchain.ts`). */
  arenaPoolId?: ArenaPoolId
  /** Sell token0 for token1 or the reverse (sorted Uniswap pool order). */
  arenaDirection?: "token0_to_token1" | "token1_to_token0"
  /** User-deployed lab pool — overrides arena/token resolution when present. */
  labPool?: LabPoolDef
  /** Same semantics as `arenaDirection`, applied to the lab pool's sorted currencies. */
  labPoolDirection?: "token0_to_token1" | "token1_to_token0"
  /** Optional override; defaults to both sides = agent chain. */
  tokenInChainId?: number
  tokenOutChainId?: number
  /** One of `slippageTolerance` (number) or `autoSlippage` — we send slippage from agent config. */
  autoSlippage?: "DEFAULT"
  /** Override routing protocols; default is V4-only (see `buildAgentQuoteRequestBody`). */
  protocols?: string[]
  routingPreference?: "BEST_PRICE" | "FASTEST"
}

/** Builds a **`/quote`** JSON body from dashboard agent settings + explicit swap params. */
export function buildAgentQuoteRequestBody(input: BuildAgentQuoteBodyInput): Record<string, unknown> {
  const chainId = chainIdFromSlug(input.config.chain)
  if (!chainId) {
    throw new Error(`Unknown AgentConfig.chain slug: ${input.config.chain}`)
  }

  const tokenInChainId = input.tokenInChainId ?? chainId
  const tokenOutChainId = input.tokenOutChainId ?? chainId

  let tokenIn: string | undefined
  let tokenOut: string | undefined

  if (input.labPool && input.labPoolDirection) {
    const { token0, token1 } = input.labPool
    tokenIn =
      input.labPoolDirection === "token0_to_token1"
        ? token0.address.toLowerCase()
        : token1.address.toLowerCase()
    tokenOut =
      input.labPoolDirection === "token0_to_token1"
        ? token1.address.toLowerCase()
        : token0.address.toLowerCase()
  } else if (input.arenaPoolId && input.arenaDirection) {
    const pool = getArenaPoolOnChain(input.arenaPoolId, input.config.chain)
    if (!pool) {
      throw new Error(
        `Arena pool "${input.arenaPoolId}" is not mapped on chain slug "${input.config.chain}".`,
      )
    }
    tokenIn =
      input.arenaDirection === "token0_to_token1"
        ? pool.token0.address.toLowerCase()
        : pool.token1.address.toLowerCase()
    tokenOut =
      input.arenaDirection === "token0_to_token1"
        ? pool.token1.address.toLowerCase()
        : pool.token0.address.toLowerCase()
  } else {
    const tin = input.tokenIn ?? ""
    const tout = input.tokenOut ?? ""
    tokenIn =
      resolveTradingTokenAddress(input.config.chain, tin) ??
      (tin.trim().startsWith("0x") ? tin.trim().toLowerCase() : undefined)
    tokenOut =
      resolveTradingTokenAddress(input.config.chain, tout) ??
      (tout.trim().startsWith("0x") ? tout.trim().toLowerCase() : undefined)
  }

  if (!tokenIn || !tokenOut) {
    throw new Error(
      `Could not resolve token addresses for this quote on ${input.config.chain}.`,
    )
  }

  const slippageTolerance = input.autoSlippage
    ? undefined
    : parseAgentSlippageTolerancePercent(input.config.slippage)

  const body: Record<string, unknown> = {
    type: "EXACT_INPUT",
    amount: input.amount,
    tokenInChainId,
    tokenOutChainId,
    tokenIn,
    tokenOut,
    swapper: input.swapper,
    routingPreference: input.routingPreference ?? "BEST_PRICE",
    urgency: "urgent",
  }

  if (input.autoSlippage) {
    body.autoSlippage = input.autoSlippage
  } else if (slippageTolerance !== undefined) {
    body.slippageTolerance = slippageTolerance
  }

  /* Rumble trades through Uniswap v4 pools only (Trading API `protocols`). */
  if (input.protocols && input.protocols.length > 0) {
    body.protocols = input.protocols
  } else {
    body.protocols = ["V4"]
  }

  return body
}
