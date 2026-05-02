import type { AgentActivityEvent, ExecutionKind } from "@/components/dashboard/activity-types"

const POOL = "ETH / USDC · 0.05%"

function randShortTx(): string {
  const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
  return `0x${hex}…`
}

function pickKind(hit: boolean): ExecutionKind {
  if (!hit) return "box_skipped"
  const r = Math.random()
  if (r < 0.38) return "swap"
  if (r < 0.62) return "add_liquidity"
  if (r < 0.82) return "remove_liquidity"
  if (r < 0.94) return "claim_fees"
  return "close_position"
}

function titleFor(kind: ExecutionKind): string {
  switch (kind) {
    case "swap":
      return "Swap executed"
    case "add_liquidity":
      return "Liquidity added"
    case "remove_liquidity":
      return "Liquidity removed"
    case "claim_fees":
      return "Fees claimed"
    case "close_position":
      return "Position closed"
    case "box_skipped":
      return "Box missed"
    default:
      return "Agent update"
  }
}

function reasonFor(kind: ExecutionKind, hit: boolean): string {
  if (!hit && kind === "box_skipped") {
    return "Price moved past the trigger band before the route landed; agent skipped to avoid bad fills."
  }
  switch (kind) {
    case "swap":
      return "Arena head aligned with your active row; quoter picked the best-path swap within slippage caps."
    case "add_liquidity":
      return "Spot entered the LP box; agent widened range within max-position rules for this pool."
    case "remove_liquidity":
      return "Take-profit / IL trim: band exit triggered partial unwind per reflection depth."
    case "claim_fees":
      return "Fee accrual crossed minimum claim threshold; gas vs reward stayed under your gas cap."
    case "close_position":
      return "Volatility shift flagged range exit; position flattened before adverse IL."
    default:
      return "Strategy tick evaluated boxes and pool guardrails for this resolution."
  }
}

function detailFor(kind: ExecutionKind, payoutEth: number, mult: number): string {
  const usdc = Math.round(580 + Math.random() * 420)
  switch (kind) {
    case "swap":
      return `${POOL} · −0.04 ETH → +${usdc} USDC · target ×${mult.toFixed(2)}`
    case "add_liquidity":
      return `${POOL} · +${(payoutEth * 0.45).toFixed(3)} ETH + ${Math.round(700 + Math.random() * 200)} USDC in range`
    case "remove_liquidity":
      return `${POOL} · −LP · +${(payoutEth * 0.8).toFixed(3)} ETH (principal + fees)`
    case "claim_fees":
      return `${POOL} · +$${(42 + Math.random() * 28).toFixed(0)} fees collected`
    case "close_position":
      return `${POOL} · range exit · IL hedged · net +${payoutEth.toFixed(4)} ETH`
    case "box_skipped":
      return "Price left trigger band before fill · no route executed"
    default:
      return `${POOL}`
  }
}

export type HitPayload = {
  hit: boolean
  mult: number
  payoutEth: number
}

export function buildActivityFromHit(payload: HitPayload): AgentActivityEvent {
  const kind = pickKind(payload.hit)
  const gasGwei = Math.round(18 + Math.random() * 38)
  const pnl = payload.hit ? payload.payoutEth * (0.85 + Math.random() * 0.12) : undefined

  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
    kind,
    title: titleFor(kind),
    detail: detailFor(kind, payload.payoutEth, payload.mult),
    reason: reasonFor(kind, payload.hit),
    pnlEth: pnl,
    gasGwei,
    txShort: randShortTx(),
  }
}
