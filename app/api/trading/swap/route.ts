import { NextResponse } from "next/server"
import { getTradingAuditIdentity, logTradingAudit } from "@/lib/api/trading-audit"
import { stripTradingRequestMeta } from "@/lib/api/trading-meta"
import { RomboUniswapError } from "@/lib/integrations/uniswap/errors"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import { uniswapCreateSwap } from "@/lib/integrations/uniswap/trading"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

/** Submit **`/swap`** calldata request (classic / bridge / wrap flows). */
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
  const agentId = typeof raw.agentId === "string" ? raw.agentId : undefined
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined
  const permit2Disabled =
    typeof raw.permit2Disabled === "boolean" ? raw.permit2Disabled : undefined

  let payload: Record<string, unknown> | undefined

  try {
    payload = stripTradingRequestMeta(raw) as Record<string, unknown>

    const data = await withUniswapRetry(() =>
      uniswapCreateSwap(payload, {
        permit2Disabled: permit2Disabled === true,
      }),
    )

    logTradingAudit({
      identity,
      kind: "swap",
      agentId,
      idempotencyKey,
      payload,
      response: data,
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error("[trading/swap]", e)

    logTradingAudit({
      identity,
      kind: "swap",
      agentId,
      idempotencyKey,
      payload: payload ?? stripTradingRequestMeta(raw),
      error: e,
    })

    if (e instanceof RomboUniswapError) {
      return NextResponse.json(
        { error: e.message, code: e.code, requestId: e.requestId },
        { status: 502 },
      )
    }
    const message = e instanceof Error ? e.message : "Swap calldata request failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
