import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { AgentConfig } from "@/lib/agents/agent-types"
import { insertTradingAttempt } from "@/lib/db/trading.repo"
import type { SwapQuoteSnapshot } from "@/lib/trading/swap-quote-snapshot"
import { RomboUniswapError, UNISWAP_ERROR_CODES } from "@/lib/integrations/uniswap/errors"
import { buildAgentQuoteRequestBody } from "@/lib/integrations/uniswap/agent-quote"
import { tryExtractEip712FromQuote } from "@/lib/integrations/uniswap/eip712-from-quote"
import {
  extractUniswapRequestId,
  hashPayloadForAudit,
} from "@/lib/integrations/uniswap/quote-metadata"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import { submitSignedSwapOrOrder } from "@/lib/integrations/uniswap/execute"
import {
  tryExtractTxHash,
  tryExtractUnsignedTxFromSwapResponse,
  type RomboUnsignedEthTx,
} from "@/lib/integrations/uniswap/swap-response-tx"
import { tryBuildSwapQuoteSnapshot } from "@/lib/integrations/uniswap/swap-quote-amounts"
import { uniswapQuote } from "@/lib/integrations/uniswap/trading"
import {
  signAndBroadcastEthereumTransaction,
  signEthereumTypedDataV4,
  type RomboEthereumTypedDataInput,
} from "@/lib/integrations/privy/wallet-signing"
import { getRomboServerEnv } from "@/lib/rombo/server-env"
import { safeExcerpt } from "@/lib/api/trading-audit"
import type { RuntimeDecision } from "@/lib/agents/runtime/evaluate-boxes"
import { executeAgentLpDecision } from "@/lib/agents/runtime/execute-agent-lp"
import type { ExecuteAgentContext, ExecuteOutcome } from "@/lib/agents/runtime/execute-types"

export type { ExecuteAgentContext, ExecuteOutcome } from "@/lib/agents/runtime/execute-types"

function romboTxToPrivy(tx: RomboUnsignedEthTx): Record<string, unknown> {
  return { ...tx }
}

async function persistAttempt(input: {
  ctx: ExecuteAgentContext
  kind: "quote" | "swap"
  payload?: unknown
  response?: unknown
  error?: unknown
  txHash?: string
  swapQuote?: SwapQuoteSnapshot
}): Promise<void> {
  const status = input.error ? ("error" as const) : ("ok" as const)
  let errorCode: string | undefined
  let excerpt: string | undefined
  if (input.error instanceof RomboUniswapError) {
    errorCode = input.error.code
    excerpt = safeExcerpt(input.error.message)
  } else if (input.error instanceof Error) {
    excerpt = safeExcerpt(input.error.message)
  }

  const response = input.response
  const requestId = extractUniswapRequestId(response)
  const payloadHash = input.payload !== undefined ? hashPayloadForAudit(input.payload) : undefined

  await insertTradingAttempt({
    romboUserIdHex: input.ctx.romboUserIdHex,
    email: input.ctx.email,
    agentId: input.ctx.agentId,
    idempotencyKey: `${input.ctx.idempotencyKey}:${input.kind}`,
    kind: input.kind,
    uniswapRequestId: requestId,
    payloadHash,
    chainId: input.ctx.chainId,
    txHash: input.txHash,
    status,
    errorCode,
    excerpt,
    swapQuote: input.swapQuote,
  })
}

/** Swap path for autonomous ticks — quotes, signs with Privy, broadcasts when enabled. */
export async function executeAgentDecision(
  decision: RuntimeDecision,
  ctx: ExecuteAgentContext,
): Promise<ExecuteOutcome> {
  if (decision.type === "skip") {
    return { ok: false, summary: decision.reason }
  }

  if (decision.type === "lp_increase" || decision.type === "lp_decrease") {
    return executeAgentLpDecision(decision, ctx)
  }

  if (decision.type !== "swap") {
    return { ok: false, summary: "unsupported_decision" }
  }

  const env = getRomboServerEnv()
  if (!env.hasUniswap) {
    return { ok: false, summary: "uniswap_not_configured", error: "UNISWAP_API_KEY" }
  }

  const arenaPoolId = decision.arenaPoolId as ArenaPoolId

  const quoteBody = buildAgentQuoteRequestBody({
    config: ctx.config,
    amount: decision.amount,
    swapper: ctx.walletAddress,
    arenaPoolId,
    arenaDirection: decision.direction,
  })

  let quoteResponse: unknown
  try {
    quoteResponse = await withUniswapRetry(() =>
      uniswapQuote(quoteBody, {
        permit2Disabled: true,
      }),
    )
    await persistAttempt({ ctx, kind: "quote", payload: quoteBody, response: quoteResponse })
  } catch (e) {
    await persistAttempt({ ctx, kind: "quote", payload: quoteBody, error: e })
    const errorMsg = e instanceof Error ? e.message : String(e)
    const noRouteTestnet =
      e instanceof RomboUniswapError &&
      e.code === UNISWAP_ERROR_CODES.NO_QUOTE &&
      ctx.config.chain === "base-sepolia"
    return {
      ok: false,
      summary: noRouteTestnet ? "quote_failed_no_route_testnet" : "quote_failed",
      error: errorMsg,
    }
  }

  const eip712 = tryExtractEip712FromQuote(quoteResponse)
  if (!eip712) {
    await persistAttempt({
      ctx,
      kind: "swap",
      payload: { phase: "missing_eip712" },
      error: new Error("Quote missing EIP-712 payload"),
    })
    return { ok: false, summary: "missing_eip712_in_quote" }
  }

  const typedData: RomboEthereumTypedDataInput = {
    domain: eip712.domain,
    types: eip712.types,
    primary_type: eip712.primary_type,
    message: eip712.message,
  }

  let signature: string
  try {
    signature = await signEthereumTypedDataV4({
      walletId: ctx.privyWalletId,
      typedData,
      idempotencyKey: `${ctx.idempotencyKey}:typed`,
    })
  } catch (e) {
    await persistAttempt({
      ctx,
      kind: "swap",
      payload: { phase: "sign" },
      error: e,
    })
    return {
      ok: false,
      summary: "typed_data_sign_failed",
      error: e instanceof Error ? e.message : String(e),
    }
  }

  if (!env.executeAgentSwaps) {
    await persistAttempt({
      ctx,
      kind: "swap",
      payload: { simulate: true },
      response: { quoteSigned: true },
    })
    return { ok: true, summary: "quote_signed_execute_disabled", txHash: undefined }
  }

  let swapResponse: unknown
  try {
    swapResponse = await withUniswapRetry(() =>
      submitSignedSwapOrOrder(quoteResponse, signature, {
        permit2Disabled: true,
      }),
    )
  } catch (e) {
    await persistAttempt({
      ctx,
      kind: "swap",
      payload: quoteBody,
      error: e,
    })
    return {
      ok: false,
      summary: "swap_submit_failed",
      error: e instanceof Error ? e.message : String(e),
    }
  }

  let txHash = tryExtractTxHash(swapResponse)

  if (!txHash) {
    const unsigned = tryExtractUnsignedTxFromSwapResponse(swapResponse)
    if (unsigned) {
      try {
        const { txHash: h } = await signAndBroadcastEthereumTransaction({
          walletId: ctx.privyWalletId,
          chainId: ctx.chainId,
          transaction: romboTxToPrivy(unsigned),
          idempotencyKey: `${ctx.idempotencyKey}:send`,
        })
        txHash = h
      } catch (e) {
        await persistAttempt({
          ctx,
          kind: "swap",
          payload: swapResponse,
          error: e,
        })
        return {
          ok: false,
          summary: "broadcast_failed",
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }
  }

  const swapQuote =
    tryBuildSwapQuoteSnapshot({
      quoteBody,
      quoteResponse,
      chainId: ctx.chainId,
      evaluatedAtMs: Date.now(),
    }) ?? undefined

  await persistAttempt({
    ctx,
    kind: "swap",
    payload: quoteBody,
    response: swapResponse,
    txHash,
    swapQuote,
  })

  if (!txHash) {
    return { ok: false, summary: "missing_tx_hash", error: "swap_response_unparsed" }
  }

  return { ok: true, txHash, summary: "swap_broadcast" }
}
