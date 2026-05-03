import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getTradableArenaPools } from "@/lib/agents/arena-pools"
import { chartCoordFromUsd } from "@/lib/agents/runtime/chart-coord"
import type { AgentConfig } from "@/lib/agents/agent-types"
import type { LabPoolDef } from "@/lib/agents/lab-pools"
import type { PriceBox } from "@/components/dashboard/types"
import { resolveTradingTokenAddress } from "@/lib/integrations/uniswap/token-addresses"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"

export type SwapArenaDirection = "token0_to_token1" | "token1_to_token0"

/**
 * Decision target — either a canonical arena pool (`arenaPoolId`) or a user's
 * lab pool (`labPoolId` + a snapshot of `LabPoolDef`). Exactly one side is set
 * in each decision so downstream code can branch without re-parsing.
 */
export type DecisionTarget =
  | { kind: "arena"; arenaPoolId: ArenaPoolId }
  | { kind: "lab"; labPoolId: string; labPool: LabPoolDef }

export type RuntimeDecision =
  | { type: "skip"; reason: string; target?: DecisionTarget }
  | {
      type: "swap"
      target: DecisionTarget
      boxId: string
      direction: SwapArenaDirection
      /** ERC-20 / native amount in smallest units (decimal string). */
      amount: string
    }
  | {
      type: "lp_increase"
      target: DecisionTarget
      boxId: string
      reason: string
      chartLow: number
      chartHigh: number
      amountPercent?: string
    }
  | {
      type: "lp_decrease"
      target: DecisionTarget
      boxId: string
      reason: string
      chartLow: number
      chartHigh: number
      amountPercent?: string
    }

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

/**
 * Uniswap `token0` / `token1` are sorted by address; the same logical pair (e.g. ETH→USDC)
 * maps to `token0_to_token1` on one chain and `token1_to_token0` on another. Align
 * `SwapArenaDirection` with `symbolsForSwap` + on-chain pool metadata.
 */
function swapDirectionForArena(arenaPoolId: ArenaPoolId, chainSlug: string): SwapArenaDirection {
  const pool = getArenaPoolOnChain(arenaPoolId, chainSlug)
  const { inSym, outSym } = symbolsForSwap(arenaPoolId)
  if (!pool || !inSym || !outSym) {
    return defaultSwapDirection(arenaPoolId)
  }
  const tokenInAddr = resolveTradingTokenAddress(chainSlug, inSym)
  const tokenOutAddr = resolveTradingTokenAddress(chainSlug, outSym)
  if (!tokenInAddr || !tokenOutAddr) {
    return defaultSwapDirection(arenaPoolId)
  }
  const t0 = pool.token0.address.toLowerCase()
  const t1 = pool.token1.address.toLowerCase()
  const aIn = tokenInAddr.toLowerCase()
  const aOut = tokenOutAddr.toLowerCase()
  if (aIn === t0 && aOut === t1) return "token0_to_token1"
  if (aIn === t1 && aOut === t0) return "token1_to_token0"
  return defaultSwapDirection(arenaPoolId)
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

export function computeNotionalAmount(config: AgentConfig, box: PriceBox, arenaPoolId: ArenaPoolId): string {
  const bet = Number.parseFloat(config.betAmount) || 0
  const boxPct = parsePercent(box.amountPercent, 33) / 100
  const maxPos = parsePercent(config.maxPositionPercent, 25) / 100
  const raw = bet * boxPct * maxPos
  const dec = decimalsForArenaSwapInput(arenaPoolId)
  return humanAmountToBaseUnits(raw, dec)
}

/**
 * Lab-pool notional sizing — uses `tokenIn.decimals` from the pool so the
 * smallest-unit `amount` matches the ERC-20 / native side we are spending.
 */
export function computeNotionalAmountForLabPool(
  config: AgentConfig,
  box: PriceBox,
  labPool: LabPoolDef,
  direction: SwapArenaDirection,
): string {
  const bet = Number.parseFloat(config.betAmount) || 0
  const boxPct = parsePercent(box.amountPercent, 33) / 100
  const maxPos = parsePercent(config.maxPositionPercent, 25) / 100
  const raw = bet * boxPct * maxPos
  const tokenIn = direction === "token0_to_token1" ? labPool.token0 : labPool.token1
  return humanAmountToBaseUnits(raw, tokenIn.decimals)
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

  const target: DecisionTarget = { kind: "arena", arenaPoolId }

  switch (hit.action) {
    case "swap":
      return {
        type: "swap",
        target,
        boxId: hit.id,
        direction: swapDirectionForArena(arenaPoolId, config.chain),
        amount,
      }
    case "add_liquidity":
      return {
        type: "lp_increase",
        target,
        boxId: hit.id,
        reason: "box_action",
        chartLow: hit.low,
        chartHigh: hit.high,
        amountPercent: hit.amountPercent,
      }
    case "remove_liquidity":
      return {
        type: "lp_decrease",
        target,
        boxId: hit.id,
        reason: "box_action",
        chartLow: hit.low,
        chartHigh: hit.high,
        amountPercent: hit.amountPercent,
      }
    default:
      return { type: "skip", reason: "unknown_box_action" }
  }
}

/**
 * Same shape as `decisionForMatchedBox` but sized to a user's lab pool. Lab pools
 * skip the arena `approvedTokens` symbol whitelist (the user explicitly opted-in
 * to this pool when registering it for the agent).
 */
export function decisionForMatchedLabBox(
  hit: PriceBox,
  labPool: LabPoolDef,
  config: AgentConfig,
  direction: SwapArenaDirection,
): RuntimeDecision {
  const amount = computeNotionalAmountForLabPool(config, hit, labPool, direction)
  if (amount === "0") {
    return { type: "skip", reason: "zero_notional" }
  }

  const target: DecisionTarget = { kind: "lab", labPoolId: labPool.labPoolId, labPool }

  switch (hit.action) {
    case "swap":
      return {
        type: "swap",
        target,
        boxId: hit.id,
        direction,
        amount,
      }
    case "add_liquidity":
      return {
        type: "lp_increase",
        target,
        boxId: hit.id,
        reason: "box_action",
        chartLow: hit.low,
        chartHigh: hit.high,
        amountPercent: hit.amountPercent,
      }
    case "remove_liquidity":
      return {
        type: "lp_decrease",
        target,
        boxId: hit.id,
        reason: "box_action",
        chartLow: hit.low,
        chartHigh: hit.high,
        amountPercent: hit.amountPercent,
      }
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
