import { NextResponse } from "next/server"
import { getTradingAuditIdentity, logTradingAudit } from "@/lib/api/trading-audit"
import { RomboUniswapError } from "@/lib/integrations/uniswap/errors"
import { submitSignedSwapOrOrder } from "@/lib/integrations/uniswap/execute"
import { hashPayloadForAudit } from "@/lib/integrations/uniswap/quote-metadata"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

/**
 * Convenience route: pass **`quoteResponse`** from `/api/trading/quote` plus **`signature`**
 * (signed permit or UniswapX order). Routes to **`/swap`** or **`/order`** based on `routing`.
 */
export async function POST(req: Request) {
  const env = getRomboServerEnv()
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
  const quoteResponse = raw.quoteResponse
  const signature = typeof raw.signature === "string" ? raw.signature : ""
  if (!quoteResponse || !signature) {
    return NextResponse.json(
      { error: "quoteResponse and signature (hex) are required" },
      { status: 400 },
    )
  }

  const agentId = typeof raw.agentId === "string" ? raw.agentId : undefined
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined
  const broadcastNonce =
    typeof raw.broadcastNonce === "number" && Number.isFinite(raw.broadcastNonce)
      ? raw.broadcastNonce
      : undefined
  const walletAddress = typeof raw.walletAddress === "string" ? raw.walletAddress.trim() : undefined
  const chainIdMeta =
    typeof raw.chainId === "number" && Number.isFinite(raw.chainId) ? raw.chainId : undefined

  const permit2Disabled =
    typeof raw.permit2Disabled === "boolean" ? raw.permit2Disabled : undefined
  const erc20EthEnabled =
    typeof raw.erc20EthEnabled === "boolean" ? raw.erc20EthEnabled : undefined
  const refreshGasPrice =
    typeof raw.refreshGasPrice === "boolean" ? raw.refreshGasPrice : undefined
  const simulateTransaction =
    typeof raw.simulateTransaction === "boolean" ? raw.simulateTransaction : undefined

  const auditPayload = {
    quotePayloadHash: hashPayloadForAudit(quoteResponse),
    signatureLength: signature.length,
  }

  try {
    const data = await withUniswapRetry(() =>
      submitSignedSwapOrOrder(quoteResponse, signature, {
        permit2Disabled: permit2Disabled === true,
        erc20EthEnabled: erc20EthEnabled === true,
        refreshGasPrice,
        simulateTransaction,
      }),
    )

    logTradingAudit({
      identity,
      kind: "execute",
      agentId,
      idempotencyKey,
      payload: auditPayload,
      response: data,
      broadcastNonce,
      walletAddress,
      chainId: chainIdMeta,
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error("[trading/execute]", e)

    logTradingAudit({
      identity,
      kind: "execute",
      agentId,
      idempotencyKey,
      payload: auditPayload,
      error: e,
      broadcastNonce,
      walletAddress,
      chainId: chainIdMeta,
    })

    if (e instanceof RomboUniswapError) {
      return NextResponse.json(
        { error: e.message, code: e.code, requestId: e.requestId },
        { status: 502 },
      )
    }
    const message = e instanceof Error ? e.message : "Execute failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
