import { NextResponse } from "next/server"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { ARENA_POOL_IDS } from "@/lib/agents/arena-pools"
import type { AgentConfig } from "@/lib/agents/agent-types"
import { getTradingAuditIdentity, logTradingAudit } from "@/lib/api/trading-audit"
import { stripTradingRequestMeta } from "@/lib/api/trading-meta"
import { RumbleUniswapError } from "@/lib/integrations/uniswap/errors"
import { buildAgentQuoteRequestBody } from "@/lib/integrations/uniswap/agent-quote"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import { uniswapQuote } from "@/lib/integrations/uniswap/trading"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

function isArenaPoolId(s: string): s is ArenaPoolId {
  return (ARENA_POOL_IDS as readonly string[]).includes(s)
}

export async function POST(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasUniswap) {
    return NextResponse.json({ error: "UNISWAP_API_KEY is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const agentId = typeof raw.agentId === "string" ? raw.agentId : undefined
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined
  const broadcastNonce =
    typeof raw.broadcastNonce === "number" && Number.isFinite(raw.broadcastNonce)
      ? raw.broadcastNonce
      : undefined
  const walletAddress = typeof raw.walletAddress === "string" ? raw.walletAddress.trim() : undefined
  const chainIdMeta =
    typeof raw.chainId === "number" && Number.isFinite(raw.chainId) ? raw.chainId : undefined

  let payload: Record<string, unknown> | undefined
  let permit2Disabled: boolean | undefined
  let erc20EthEnabled: boolean | undefined

  try {
    if ("agentConfig" in raw && raw.agentConfig && typeof raw.agentConfig === "object") {
      const amount = typeof raw.amount === "string" ? raw.amount : ""
      const swapper = typeof raw.swapper === "string" ? raw.swapper.trim() : ""
      const tokenIn = typeof raw.tokenIn === "string" ? raw.tokenIn : ""
      const tokenOut = typeof raw.tokenOut === "string" ? raw.tokenOut : ""
      const arenaRaw = typeof raw.arenaPoolId === "string" ? raw.arenaPoolId : ""
      const arenaDirection =
        raw.arenaDirection === "token0_to_token1" || raw.arenaDirection === "token1_to_token0"
          ? raw.arenaDirection
          : undefined
      const useArena = Boolean(
        arenaRaw && arenaDirection && isArenaPoolId(arenaRaw),
      )

      if (!amount || !swapper || (!useArena && (!tokenIn || !tokenOut))) {
        return NextResponse.json(
          {
            error:
              "agent mode requires amount, swapper, and either (tokenIn + tokenOut) or (arenaPoolId + arenaDirection)",
          },
          { status: 400 },
        )
      }

      payload = buildAgentQuoteRequestBody({
        config: raw.agentConfig as AgentConfig,
        amount,
        swapper,
        ...(useArena
          ? { arenaPoolId: arenaRaw as ArenaPoolId, arenaDirection }
          : { tokenIn, tokenOut }),
      })
      permit2Disabled =
        typeof raw.permit2Disabled === "boolean" ? raw.permit2Disabled : undefined
      erc20EthEnabled =
        typeof raw.erc20EthEnabled === "boolean" ? raw.erc20EthEnabled : undefined
    } else {
      payload = stripTradingRequestMeta(raw) as Record<string, unknown>
      permit2Disabled =
        typeof raw.permit2Disabled === "boolean" ? raw.permit2Disabled : undefined
      erc20EthEnabled =
        typeof raw.erc20EthEnabled === "boolean" ? raw.erc20EthEnabled : undefined
    }

    const data = await withUniswapRetry(() =>
      uniswapQuote(payload!, {
        permit2Disabled: permit2Disabled === true,
        erc20EthEnabled: erc20EthEnabled === true,
      }),
    )

    logTradingAudit({
      identity,
      kind: "quote",
      agentId,
      idempotencyKey,
      payload,
      response: data,
      broadcastNonce,
      walletAddress,
      chainId: chainIdMeta,
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error("[trading/quote]", e)

    logTradingAudit({
      identity,
      kind: "quote",
      agentId,
      idempotencyKey,
      payload: payload ?? stripTradingRequestMeta(raw),
      error: e,
      broadcastNonce,
      walletAddress,
      chainId: chainIdMeta,
    })

    if (e instanceof RumbleUniswapError) {
      return NextResponse.json(
        { error: e.message, code: e.code, requestId: e.requestId },
        { status: 502 },
      )
    }
    const message = e instanceof Error ? e.message : "Quote failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
