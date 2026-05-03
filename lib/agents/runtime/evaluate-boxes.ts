import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getTradableArenaPools } from "@/lib/agents/arena-pools"
import { chartCoordFromUsd } from "@/lib/agents/runtime/chart-coord"
import type { AgentConfig } from "@/lib/agents/agent-types"
import type { PriceBox } from "@/components/dashboard/types"

export type SwapArenaDirection = "token0_to_token1" | "token1_to_token0"

export type RuntimeDecision =
  | { type: "skip"; reason: string }
  | {
      type: "swap"
      arenaPoolId: ArenaPoolId
      boxId: string
      direction: SwapArenaDirection
      /** ERC-20 / native amount in smallest units (decimal string). */
      amount: string
    }
  | { type: "lp_increase"; arenaPoolId: ArenaPoolId; boxId: string; reason: string }
  | { type: "lp_decrease"; arenaPoolId: ArenaPoolId; boxId: string; reason: string }

function parsePercent(s: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(s ?? "").replace("%", "").trim())
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(n, 100)
}

function parseCsvSymbols(approved: string): Set<string> {
  return new Set(
    approved
      .split(",")
      .map(x => x.trim().toUpperCase())
      .filter(Boolean),
  )
}

function pow10bigint(exp: number): bigint {
  let x = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < exp; i++) x *= ten
  return x
}

/** Convert a human float amount to integer string in `decimals` base units. */
export function humanAmountToBaseUnits(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0"
  const d = Math.min(36, Math.max(0, Math.floor(decimals)))
  const fixed = amount.toFixed(d)
  const [wholeRaw = "0", fracRaw = ""] = fixed.split(".")
  const frac = (fracRaw + "0".repeat(d)).slice(0, d)
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0"
  return (BigInt(whole) * pow10bigint(d) + BigInt(frac || "0")).toString()
}

function defaultSwapDirection(arenaPoolId: ArenaPoolId): SwapArenaDirection {
  switch (arenaPoolId) {
    case "eth-usdc":
      return "token0_to_token1"
    case "wbtc-eth":
      return "token0_to_token1"
    case "usdc-usdt":
      return "token0_to_token1"
    default:
      return "token0_to_token1"
  }
}

function symbolsForSwap(arenaPoolId: ArenaPoolId): { inSym: string; outSym: string } {
  switch (arenaPoolId) {
    case "eth-usdc":
      return { inSym: "ETH", outSym: "USDC" }
    case "wbtc-eth":
      return { inSym: "WBTC", outSym: "ETH" }
    case "usdc-usdt":
      return { inSym: "USDC", outSym: "USDT" }
    default:
      return { inSym: "", outSym: "" }
  }
}

function decimalsForArenaSwapInput(arenaPoolId: ArenaPoolId): number {
  switch (arenaPoolId) {
    case "eth-usdc":
      return 18
    case "wbtc-eth":
      return 8
    case "usdc-usdt":
      return 6
    default:
      return 18
  }
}

function computeNotionalAmount(config: AgentConfig, box: PriceBox, arenaPoolId: ArenaPoolId): string {
  const bet = Number.parseFloat(config.betAmount) || 0
  const boxPct = parsePercent(box.amountPercent, 33) / 100
  const maxPos = parsePercent(config.maxPositionPercent, 25) / 100
  const raw = bet * boxPct * maxPos
  const dec = decimalsForArenaSwapInput(arenaPoolId)
  return humanAmountToBaseUnits(raw, dec)
}

/**
 * Build swap/LP decision from a price box that already matches current spot (coordinate space).
 * Action type (swap vs LP) comes from the stored box — not from the LLM.
 */
export function decisionForMatchedBox(
  hit: PriceBox,
  arenaPoolId: ArenaPoolId,
  config: AgentConfig,
): RuntimeDecision {
  const approved = parseCsvSymbols(config.approvedTokens)
  const { inSym, outSym } = symbolsForSwap(arenaPoolId)
  if (inSym && (!approved.has(inSym) || !approved.has(outSym))) {
    return { type: "skip", reason: "token_not_approved" }
  }

  const amount = computeNotionalAmount(config, hit, arenaPoolId)
  if (amount === "0") {
    return { type: "skip", reason: "zero_notional" }
  }

  switch (hit.action) {
    case "swap":
      return {
        type: "swap",
        arenaPoolId,
        boxId: hit.id,
        direction: defaultSwapDirection(arenaPoolId),
        amount,
      }
    case "add_liquidity":
      return { type: "lp_increase", arenaPoolId, boxId: hit.id, reason: "box_action" }
    case "remove_liquidity":
      return { type: "lp_decrease", arenaPoolId, boxId: hit.id, reason: "box_action" }
    default:
      return { type: "skip", reason: "unknown_box_action" }
  }
}

/**
 * Pick at most one action when spot USD sits inside a runtime price box.
 * Coordinate space matches `getPoolChartSim` / dashboard canvas.
 */
export function evaluatePriceBoxes(input: {
  displayUsd: number
  arenaPoolId: ArenaPoolId
  boxes: PriceBox[]
  config: AgentConfig
}): RuntimeDecision {
  const { displayUsd, arenaPoolId, boxes, config } = input

  const tradable = getTradableArenaPools(config.tradeAllPools, config.enabledPoolIds)
  if (!tradable.some(p => p.id === arenaPoolId)) {
    return { type: "skip", reason: "pool_not_enabled" }
  }

  const coord = chartCoordFromUsd(displayUsd, arenaPoolId)

  const ordered = [...boxes].sort((a, b) => a.low - b.low)
  const hit = ordered.find(b => coord >= b.low && coord <= b.high)
  if (!hit) {
    return { type: "skip", reason: "no_box_hit" }
  }

  return decisionForMatchedBox(hit, arenaPoolId, config)
}
