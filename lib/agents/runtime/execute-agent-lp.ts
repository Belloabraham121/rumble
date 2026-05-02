import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import {
  computeNotionalAmount,
  type RuntimeDecision,
} from "@/lib/agents/runtime/evaluate-boxes"
import type { ExecuteAgentContext, ExecuteOutcome } from "@/lib/agents/runtime/execute-types"
import { maybePersistLpPositionFromLiquidityResponse } from "@/lib/api/liquidity-persist"
import { safeExcerpt } from "@/lib/api/trading-audit"
import { insertTradingAttempt } from "@/lib/db/trading.repo"
import { findLpPositionForAgentPool } from "@/lib/db/lp-positions.repo"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { refreshPoolPrice } from "@/lib/data/live-pool-tick"
import { RumbleUniswapError } from "@/lib/integrations/uniswap/errors"
import { parseAgentSlippageTolerancePercent } from "@/lib/integrations/uniswap/agent-quote"
import { extractOrderedLpTransactions } from "@/lib/integrations/uniswap/lp-response-tx"
import {
  extractUniswapRequestId,
  hashPayloadForAudit,
} from "@/lib/integrations/uniswap/quote-metadata"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import {
  uniswapLpCreate,
  uniswapLpDecrease,
  uniswapLpIncrease,
} from "@/lib/integrations/uniswap/liquidity"
import { signAndBroadcastEthereumTransaction } from "@/lib/integrations/privy/wallet-signing"
import { tryExtractTxHash, type RumbleUnsignedEthTx } from "@/lib/integrations/uniswap/swap-response-tx"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import type { PriceBox } from "@/components/dashboard/types"

function rumbleTxToPrivy(tx: RumbleUnsignedEthTx): Record<string, unknown> {
  return { ...tx }
}

function parsePoolTick(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

/** Map chart box height to a tick span around the pool’s current tick. */
function tickBoundsForBox(
  poolTick: number,
  chartLow: number,
  chartHigh: number,
): { tickLower: number; tickUpper: number } {
  const width = Math.abs(chartHigh - chartLow)
  const span = Math.min(10_000, Math.max(60, Math.round(width * 100)))
  const half = Math.floor(span / 2)
  return { tickLower: poolTick - half, tickUpper: poolTick + half }
}

function liquidityPercentFromBox(amountPercent: string | undefined): number {
  const n = Number.parseFloat(String(amountPercent ?? "").replace("%", "").trim())
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(100, Math.max(1, Math.round(n)))
}

function syntheticBoxForAmount(d: {
  boxId: string
  chartLow: number
  chartHigh: number
  amountPercent?: string
}): PriceBox {
  return {
    id: d.boxId,
    label: "",
    low: d.chartLow,
    high: d.chartHigh,
    action: "swap",
    color: "",
    hitLabel: "",
    amountPercent: d.amountPercent,
  }
}

async function persistLpAttempt(input: {
  ctx: ExecuteAgentContext
  kind: "lp_create" | "lp_increase" | "lp_decrease"
  payload?: unknown
  response?: unknown
  error?: unknown
  txHash?: string
  idempotencySuffix: string
}): Promise<void> {
  const status = input.error ? ("error" as const) : ("ok" as const)
  let errorCode: string | undefined
  let excerpt: string | undefined
  if (input.error instanceof RumbleUniswapError) {
    errorCode = input.error.code
    excerpt = safeExcerpt(input.error.message)
  } else if (input.error instanceof Error) {
    excerpt = safeExcerpt(input.error.message)
  }

  const response = input.response
  const requestId = extractUniswapRequestId(response)
  const payloadHash = input.payload !== undefined ? hashPayloadForAudit(input.payload) : undefined

  await insertTradingAttempt({
    rumbleUserIdHex: input.ctx.rumbleUserIdHex,
    email: input.ctx.email,
    agentId: input.ctx.agentId,
    idempotencyKey: `${input.ctx.idempotencyKey}:${input.idempotencySuffix}`,
    kind: input.kind,
    uniswapRequestId: requestId,
    payloadHash,
    chainId: input.ctx.chainId,
    txHash: input.txHash,
    status,
    errorCode,
    excerpt,
  })
}

async function resolvePoolDoc(input: {
  arenaPoolId: ArenaPoolId
  chainId: number
}): Promise<{ poolAddress: string; tick: number | null } | null> {
  let doc = await getPoolPrice({
    chainId: input.chainId,
    arenaPoolId: input.arenaPoolId,
  })
  if (!doc?.poolAddress?.trim()) {
    const refreshed = await refreshPoolPrice(input.arenaPoolId, input.chainId)
    if (!refreshed.ok) return null
    doc = await getPoolPrice({
      chainId: input.chainId,
      arenaPoolId: input.arenaPoolId,
    })
  }
  if (!doc?.poolAddress?.trim()) return null
  const tick = parsePoolTick(doc.tick)
  return { poolAddress: doc.poolAddress.trim(), tick }
}

async function broadcastLpTransactions(
  txs: RumbleUnsignedEthTx[],
  ctx: ExecuteAgentContext,
  baseSuffix: string,
): Promise<{ txHash?: string; error?: string }> {
  if (!ctx.privyWalletId) {
    return { error: "no_privy_wallet_id" }
  }
  const privyWalletId = ctx.privyWalletId
  let lastHash: string | undefined
  let i = 0
  for (const tx of txs) {
    try {
      const { txHash } = await signAndBroadcastEthereumTransaction({
        walletId: privyWalletId,
        chainId: ctx.chainId,
        transaction: rumbleTxToPrivy(tx),
        idempotencyKey: `${ctx.idempotencyKey}:${baseSuffix}:${i}`,
      })
      lastHash = txHash
      i += 1
    } catch (e) {
      return {
        txHash: lastHash,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }
  return { txHash: lastHash }
}

type LpDecision = Extract<RuntimeDecision, { type: "lp_increase" | "lp_decrease" }>

/** Liquidity provisioning path for autonomous ticks — Uniswap `/lp/*`, Privy broadcast. */
export async function executeAgentLpDecision(
  decision: LpDecision,
  ctx: ExecuteAgentContext,
): Promise<ExecuteOutcome> {
  const env = getRumbleServerEnv()
  if (!env.hasUniswap) {
    return { ok: false, summary: "uniswap_not_configured", error: "UNISWAP_API_KEY" }
  }

  if (decision.target.kind !== "arena") {
    /* LP provisioning into user-deployed lab pools isn't wired yet — only arena pools for now. */
    return { ok: false, summary: "lab_pool_lp_not_supported" }
  }
  const arenaPoolId = decision.target.arenaPoolId
  const meta = getArenaPoolOnChain(arenaPoolId, ctx.config.chain)
  if (!meta) {
    return { ok: false, summary: "arena_pool_not_on_chain", error: arenaPoolId }
  }

  const poolDoc = await resolvePoolDoc({
    arenaPoolId,
    chainId: ctx.chainId,
  })
  if (!poolDoc) {
    return { ok: false, summary: "no_pool_address_for_lp", error: "refresh_pool_price" }
  }

  const slippageTolerance = parseAgentSlippageTolerancePercent(ctx.config.slippage)

  const basePayloadCommon = {
    walletAddress: ctx.walletAddress,
    chainId: ctx.chainId,
    protocol: "V3" as const,
    token0Address: meta.token0.address,
    token1Address: meta.token1.address,
    slippageTolerance,
    simulateTransaction: false,
  }

  if (decision.type === "lp_decrease") {
    const position = await findLpPositionForAgentPool({
      agentId: ctx.agentId,
      chainId: ctx.chainId,
      arenaPoolId,
    })
    if (!position?.nftTokenId?.trim()) {
      return { ok: false, summary: "no_lp_position", error: "fund_lp_first" }
    }

    const payload: Record<string, unknown> = {
      ...basePayloadCommon,
      nftTokenId: position.nftTokenId.trim(),
      liquidityPercentageToDecrease: liquidityPercentFromBox(decision.amountPercent),
    }

    let response: unknown
    try {
      response = await withUniswapRetry(() => uniswapLpDecrease(payload))
      await persistLpAttempt({
        ctx,
        kind: "lp_decrease",
        payload,
        response,
        idempotencySuffix: "lp_decrease:call",
      })
    } catch (e) {
      await persistLpAttempt({
        ctx,
        kind: "lp_decrease",
        payload,
        error: e,
        idempotencySuffix: "lp_decrease:call",
      })
      return {
        ok: false,
        summary: "lp_decrease_failed",
        error: e instanceof Error ? e.message : String(e),
      }
    }

    if (!env.executeAgentSwaps) {
      await persistLpAttempt({
        ctx,
        kind: "lp_decrease",
        payload: { simulate: true },
        response,
        idempotencySuffix: "lp_decrease:simulate",
      })
      return { ok: true, summary: "lp_decrease_signed_execute_disabled", txHash: undefined }
    }

    const txs = extractOrderedLpTransactions(response)
    const hashFromBody = tryExtractTxHash(response)
    const broadcast = await broadcastLpTransactions(txs, ctx, "lp_decrease")
    await persistLpAttempt({
      ctx,
      kind: "lp_decrease",
      payload,
      response,
      txHash: broadcast.txHash ?? hashFromBody,
      error: broadcast.error ? new Error(broadcast.error) : undefined,
      idempotencySuffix: "lp_decrease:send",
    })

    const finalHash = broadcast.txHash ?? hashFromBody
    if (!finalHash) {
      return { ok: false, summary: "missing_tx_hash", error: broadcast.error ?? "lp_response_unparsed" }
    }
    return { ok: true, txHash: finalHash, summary: "lp_decrease_broadcast" }
  }

  // lp_increase — add to existing position or mint new one
  const box = syntheticBoxForAmount(decision)
  const amountStr = computeNotionalAmount(ctx.config, box, arenaPoolId)
  if (amountStr === "0") {
    return { ok: false, summary: "zero_notional" }
  }

  const independentTokenAddress = meta.token0.address
  const independentToken = {
    tokenAddress: independentTokenAddress,
    amount: amountStr,
  }

  const position = await findLpPositionForAgentPool({
    agentId: ctx.agentId,
    chainId: ctx.chainId,
    arenaPoolId,
  })

  if (position?.nftTokenId?.trim()) {
    const payload: Record<string, unknown> = {
      ...basePayloadCommon,
      nftTokenId: position.nftTokenId.trim(),
      independentToken,
    }

    let response: unknown
    try {
      response = await withUniswapRetry(() => uniswapLpIncrease(payload))
      await persistLpAttempt({
        ctx,
        kind: "lp_increase",
        payload,
        response,
        idempotencySuffix: "lp_increase:call",
      })
    } catch (e) {
      await persistLpAttempt({
        ctx,
        kind: "lp_increase",
        payload,
        error: e,
        idempotencySuffix: "lp_increase:call",
      })
      return {
        ok: false,
        summary: "lp_increase_failed",
        error: e instanceof Error ? e.message : String(e),
      }
    }

    if (!env.executeAgentSwaps) {
      return { ok: true, summary: "lp_increase_signed_execute_disabled", txHash: undefined }
    }

    const txs = extractOrderedLpTransactions(response)
    const hashFromBody = tryExtractTxHash(response)
    const broadcast = await broadcastLpTransactions(txs, ctx, "lp_increase")
    await persistLpAttempt({
      ctx,
      kind: "lp_increase",
      payload,
      response,
      txHash: broadcast.txHash ?? hashFromBody,
      error: broadcast.error ? new Error(broadcast.error) : undefined,
      idempotencySuffix: "lp_increase:send",
    })

    await maybePersistLpPositionFromLiquidityResponse({
      rumbleUserIdHex: ctx.rumbleUserIdHex,
      agentId: ctx.agentId,
      arenaPoolId,
      kind: "lp_increase",
      payload,
      response,
    })

    const finalHash = broadcast.txHash ?? hashFromBody
    if (!finalHash) {
      return { ok: false, summary: "missing_tx_hash", error: broadcast.error ?? "lp_response_unparsed" }
    }
    return { ok: true, txHash: finalHash, summary: "lp_increase_broadcast" }
  }

  const tick = poolDoc.tick
  if (tick === null) {
    return { ok: false, summary: "no_pool_tick", error: "need_subgraph_tick_for_range" }
  }

  const { tickLower, tickUpper } = tickBoundsForBox(tick, decision.chartLow, decision.chartHigh)

  const payload: Record<string, unknown> = {
    ...basePayloadCommon,
    existingPool: {
      token0Address: meta.token0.address,
      token1Address: meta.token1.address,
      poolReference: poolDoc.poolAddress.toLowerCase(),
    },
    independentToken,
    tickBounds: {
      tickLower,
      tickUpper,
    },
  }

  let response: unknown
  try {
    response = await withUniswapRetry(() => uniswapLpCreate(payload))
    await persistLpAttempt({
      ctx,
      kind: "lp_create",
      payload,
      response,
      idempotencySuffix: "lp_create:call",
    })
  } catch (e) {
    await persistLpAttempt({
      ctx,
      kind: "lp_create",
      payload,
      error: e,
      idempotencySuffix: "lp_create:call",
    })
    return {
      ok: false,
      summary: "lp_create_failed",
      error: e instanceof Error ? e.message : String(e),
    }
  }

  if (!env.executeAgentSwaps) {
    return { ok: true, summary: "lp_create_signed_execute_disabled", txHash: undefined }
  }

  const txs = extractOrderedLpTransactions(response)
  const hashFromBody = tryExtractTxHash(response)
  const broadcast = await broadcastLpTransactions(txs, ctx, "lp_create")
  await persistLpAttempt({
    ctx,
    kind: "lp_create",
    payload,
    response,
    txHash: broadcast.txHash ?? hashFromBody,
    error: broadcast.error ? new Error(broadcast.error) : undefined,
    idempotencySuffix: "lp_create:send",
  })

  await maybePersistLpPositionFromLiquidityResponse({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    agentId: ctx.agentId,
    arenaPoolId,
    kind: "lp_create",
    payload,
    response,
  })

  const finalHash = broadcast.txHash ?? hashFromBody
  if (!finalHash) {
    return { ok: false, summary: "missing_tx_hash", error: broadcast.error ?? "lp_response_unparsed" }
  }
  return { ok: true, txHash: finalHash, summary: "lp_create_broadcast" }
}
