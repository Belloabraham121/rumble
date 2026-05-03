import { NextResponse } from "next/server"
import { maybePersistLabPoolFromNewPoolCreate } from "@/lib/api/lab-pool-persist"
import { maybePersistLpPositionFromLiquidityResponse } from "@/lib/api/liquidity-persist"
import { getTradingAuditIdentity, logTradingAudit } from "@/lib/api/trading-audit"
import { stripLiquidityRequestMeta } from "@/lib/api/trading-meta"
import type { TradingAttemptKind } from "@/lib/db/trading.repo"
import { RomboUniswapError } from "@/lib/integrations/uniswap/errors"
import {
  uniswapLpCheckApproval,
  uniswapLpClaimFees,
  uniswapLpClaimRewards,
  uniswapLpCreate,
  uniswapLpDecrease,
  uniswapLpIncrease,
  uniswapLpMigrate,
} from "@/lib/integrations/uniswap/liquidity"
import { withUniswapRetry } from "@/lib/integrations/uniswap/retry"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

const LP_ACTIONS: Record<
  string,
  { kind: TradingAttemptKind; call: (body: Record<string, unknown>) => Promise<unknown> }
> = {
  "check-approval": { kind: "lp_check_approval", call: uniswapLpCheckApproval },
  create: { kind: "lp_create", call: uniswapLpCreate },
  increase: { kind: "lp_increase", call: uniswapLpIncrease },
  decrease: { kind: "lp_decrease", call: uniswapLpDecrease },
  claim: { kind: "lp_claim", call: uniswapLpClaimFees },
  migrate: { kind: "lp_migrate", call: uniswapLpMigrate },
  "claim-rewards": { kind: "lp_claim_rewards", call: uniswapLpClaimRewards },
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasUniswap) {
    return NextResponse.json({ error: "UNISWAP_API_KEY is not configured." }, { status: 503 })
  }

  const { action } = await ctx.params
  const entry = LP_ACTIONS[action]
  if (!entry) {
    return NextResponse.json({ error: "Unknown liquidity action" }, { status: 404 })
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
  const arenaPoolId = typeof raw.arenaPoolId === "string" ? raw.arenaPoolId : undefined
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined

  let payload: Record<string, unknown> | undefined

  try {
    payload = stripLiquidityRequestMeta(raw) as Record<string, unknown>

    const data = await withUniswapRetry(() => entry.call(payload!))

    logTradingAudit({
      identity,
      kind: entry.kind,
      agentId,
      idempotencyKey,
      payload,
      response: data,
    })

    await maybePersistLpPositionFromLiquidityResponse({
      romboUserIdHex: identity.romboUserIdHex,
      agentId,
      arenaPoolId,
      kind: entry.kind,
      payload,
      response: data,
    })

    await maybePersistLabPoolFromNewPoolCreate({
      romboUserIdHex: identity.romboUserIdHex,
      action,
      payload,
      response: data,
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error(`[liquidity/${action}]`, e)

    logTradingAudit({
      identity,
      kind: entry.kind,
      agentId,
      idempotencyKey,
      payload: payload ?? stripLiquidityRequestMeta(raw),
      error: e,
    })

    if (e instanceof RomboUniswapError) {
      return NextResponse.json(
        { error: e.message, code: e.code, requestId: e.requestId },
        { status: 502 },
      )
    }
    const message = e instanceof Error ? e.message : "Uniswap liquidity request failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
