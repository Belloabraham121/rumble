import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { RuntimeDecision } from "@/lib/agents/runtime/evaluate-boxes"
import type { ExecuteAgentContext, ExecuteOutcome } from "@/lib/agents/runtime/execute-types"
import type { AgentTickEconomics } from "@/lib/agents/runtime/llm-evaluate"
import {
  applyUserSimWalletDelta,
  findOpenLpPositionForAgentPool,
  reduceOpenLpPosition,
  upsertOpenLpPositionAdd,
  type UserSimWalletDoc,
} from "@/lib/db/sim-state.repo"
import { insertTradingAttempt } from "@/lib/db/trading.repo"
import { upsertOnchainReceipt } from "@/lib/db/onchain-receipts.repo"
import {
  clampToBand,
  getRiskBands,
  rollInBand,
  seededRandom,
  syntheticBlockNumber,
  syntheticEffectiveGasPriceWei,
  syntheticGasUsed,
  syntheticTxHash,
} from "@/lib/agents/runtime/sim-economics"

export type SimulateOutcome = ExecuteOutcome & {
  /** Realised PnL on this action in ETH (negative = loss). */
  pnlEth?: number
  /** Multiplier the sim resolved on (after clamp + rng fallback). */
  outcomeMultiplier?: number
  /** Sim gas burned in ETH. */
  gasEth?: number
  /** AI-authored narrative (or rule-based fallback). */
  narrative?: string
}

/**
 * Inputs the simulator needs beyond the regular execute context.
 */
export type SimulateAgentInput = {
  decision: Extract<RuntimeDecision, { type: "swap" | "lp_increase" | "lp_decrease" }>
  ctx: ExecuteAgentContext
  /** Spot USD price for the target pool — drives ETH ↔ USDC bookkeeping. */
  spotUsd: number
  /** Optional LLM-provided multiplier + narrative for this tick. */
  economics?: AgentTickEconomics
  /** Sim wallet doc so we don't double-fetch in tick.ts. */
  simWallet: UserSimWalletDoc
}

const BASE_USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  84532: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
}

const WETH_BY_CHAIN: `0x${string}` = "0x4200000000000000000000000000000000000006"

/**
 * Hard cap on per-action realised PnL in USD. The risk-band multipliers can
 * legitimately swing far enough that a single trade would move the wallet by
 * tens of dollars when the user runs a large `betAmount`; for sim mode we
 * keep individual fills small (gains AND losses ≤ $2) so the activity feed
 * shows steady drift rather than dramatic spikes that would read as fake.
 * The cap is applied by squeezing the effective multiplier — so the wallet
 * delta, the receipt, and the displayed PnL all stay consistent.
 */
const SIM_PNL_USD_CAP = 2.0

/**
 * Bound `rawMult` so `(rawMult - 1) * tradeUsdGross` lies inside ±cap.
 * `tradeUsdGross <= 0` short-circuits to the raw multiplier (no scaling
 * possible); typical paths always have a positive gross.
 */
function capMultiplierToPnlUsd(input: {
  rawMult: number
  tradeUsdGross: number
  cap: number
}): number {
  const { rawMult, tradeUsdGross, cap } = input
  if (!Number.isFinite(rawMult) || tradeUsdGross <= 0 || cap <= 0) return rawMult
  const rawPnlUsd = (rawMult - 1) * tradeUsdGross
  if (Math.abs(rawPnlUsd) <= cap) return rawMult
  const cappedPnlUsd = Math.sign(rawPnlUsd) * cap
  return 1 + cappedPnlUsd / tradeUsdGross
}

function arenaIsEthUsdc(decision: SimulateAgentInput["decision"]): boolean {
  return decision.target.kind === "arena" && (decision.target.arenaPoolId as ArenaPoolId) === "eth-usdc"
}

function poolKeyForDecision(decision: SimulateAgentInput["decision"]): string {
  if (decision.target.kind === "arena") return `arena:${decision.target.arenaPoolId}`
  return `lab:${decision.target.labPoolId}`
}

function notionalEth(ctx: ExecuteAgentContext, amountPercent: string | undefined): number {
  const bet = Number.parseFloat(ctx.config.betAmount) || 0
  const boxPct = clampPercent(amountPercent, 33) / 100
  const maxPos = clampPercent(ctx.config.maxPositionPercent, 25) / 100
  return Math.max(0, bet * boxPct * maxPos)
}

function clampPercent(raw: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(raw ?? "").replace("%", "").trim())
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(n, 100)
}

/**
 * Simulate one decision end-to-end:
 *  - mutates `user_sim_wallets` (ETH + USDC),
 *  - mutates `agent_sim_lp_positions` for LP actions,
 *  - writes a synthetic `trading_attempts` row + matching `onchain_receipts` row
 *    so `agent_metrics` aggregates (actions, fills, gas, swap PnL) populate
 *    without any sim-aware code paths in the metrics layer.
 */
export async function simulateAgentDecision(input: SimulateAgentInput): Promise<SimulateOutcome> {
  const { decision, ctx, spotUsd, economics, simWallet } = input
  const rng = seededRandom(`${ctx.idempotencyKey}:${decision.type}`)
  const bands = getRiskBands(ctx.config.riskLevel)

  /** Stochastic gas burn per action — actually deducts from sim ETH. */
  const gasEth = rollInBand(rng, bands.gasEth)

  /** Outcome multiplier: LLM if available + risk-band clamped, else seeded RNG. */
  const swapMult =
    economics?.outcomeMultiplier !== undefined
      ? clampToBand(economics.outcomeMultiplier, bands.swap)
      : rollInBand(rng, bands.swap)

  if (decision.type === "swap") {
    return simulateSwap({ ...input, rng, gasEth, swapMult })
  }
  if (decision.type === "lp_increase") {
    return simulateLpIncrease({ ...input, rng, gasEth })
  }
  return simulateLpDecrease({ ...input, rng, gasEth })

  // unreachable
  void simWallet
}

type Extra = { rng: () => number; gasEth: number; swapMult?: number }

async function simulateSwap(input: SimulateAgentInput & Extra & { swapMult: number }): Promise<SimulateOutcome> {
  if (input.decision.type !== "swap") {
    return { ok: false, summary: "unsupported_decision" }
  }
  const { decision, ctx, spotUsd, economics, simWallet, rng, gasEth, swapMult } = input

  const ethUsd = arenaIsEthUsdc(decision) ? spotUsd : Math.max(spotUsd, 1)
  const isEthToUsdc = arenaIsEthUsdc(decision) && decision.direction === "token0_to_token1"
  const isUsdcToEth = arenaIsEthUsdc(decision) && decision.direction === "token1_to_token0"

  const nominalEth = notionalEth(ctx, undefined)
  if (nominalEth <= 0) {
    return { ok: false, summary: "zero_notional" }
  }

  let ethDelta = 0
  let usdcDelta = 0
  let pnlEth = 0
  let amountInRaw = ""
  let amountOutRaw = ""
  let tokenIn = ""
  let tokenOut = ""
  let symbolIn: "ETH" | "USDC" = "ETH"
  let symbolOut: "ETH" | "USDC" = "USDC"
  let summary = "sim_swap"

  /**
   * `effMult` is `swapMult` squeezed so the realised USD PnL never exceeds
   * ±SIM_PNL_USD_CAP. Computed per-branch because each branch defines the
   * trade's gross USD differently.
   */
  let effMult = swapMult

  if (isEthToUsdc) {
    /** Cap by available ETH (minus gas burn) so sim never goes negative. */
    const ethAvailable = Math.max(0, parseNum(simWallet.ethBalance) - gasEth)
    const ethIn = Math.min(nominalEth, ethAvailable)
    if (ethIn <= 0) {
      return { ok: false, summary: "sim_zero_eth_balance" }
    }
    effMult = capMultiplierToPnlUsd({
      rawMult: swapMult,
      tradeUsdGross: ethIn * ethUsd,
      cap: SIM_PNL_USD_CAP,
    })
    const usdcOut = ethIn * ethUsd * effMult
    ethDelta = -ethIn
    usdcDelta = +usdcOut
    pnlEth = -ethIn + usdcOut / ethUsd
    amountInRaw = humanToRaw(ethIn, 18)
    amountOutRaw = humanToRaw(usdcOut, 6)
    tokenIn = WETH_BY_CHAIN
    tokenOut = BASE_USDC_BY_CHAIN[ctx.chainId] ?? BASE_USDC_BY_CHAIN[8453]!
    symbolIn = "ETH"
    symbolOut = "USDC"
    summary = `swap ${ethIn.toFixed(6)} ETH → ${usdcOut.toFixed(2)} USDC`
  } else if (isUsdcToEth) {
    const usdcAvailable = parseNum(simWallet.usdcBalance)
    const usdcIn = Math.min(nominalEth * ethUsd, usdcAvailable)
    if (usdcIn <= 0) {
      return { ok: false, summary: "sim_zero_usdc_balance" }
    }
    effMult = capMultiplierToPnlUsd({
      rawMult: swapMult,
      tradeUsdGross: usdcIn,
      cap: SIM_PNL_USD_CAP,
    })
    const ethOut = (usdcIn / ethUsd) * effMult
    usdcDelta = -usdcIn
    ethDelta = +ethOut
    pnlEth = -usdcIn / ethUsd + ethOut
    amountInRaw = humanToRaw(usdcIn, 6)
    amountOutRaw = humanToRaw(ethOut, 18)
    tokenIn = BASE_USDC_BY_CHAIN[ctx.chainId] ?? BASE_USDC_BY_CHAIN[8453]!
    tokenOut = WETH_BY_CHAIN
    symbolIn = "USDC"
    symbolOut = "ETH"
    summary = `swap ${usdcIn.toFixed(2)} USDC → ${ethOut.toFixed(6)} ETH`
  } else {
    /**
     * Non-ETH/USDC arena pools (wbtc-eth, usdc-usdt) and lab pools — keep
     * single-side ETH P&L bookkeeping. The agent never holds WBTC/USDT in sim,
     * but visually a tick still produces a swap row + a P&L kick into ETH.
     */
    const ethIn = Math.min(nominalEth, parseNum(simWallet.ethBalance))
    if (ethIn <= 0) {
      return { ok: false, summary: "sim_zero_eth_balance" }
    }
    effMult = capMultiplierToPnlUsd({
      rawMult: swapMult,
      tradeUsdGross: ethIn * ethUsd,
      cap: SIM_PNL_USD_CAP,
    })
    const ethOut = ethIn * effMult
    ethDelta = ethOut - ethIn
    pnlEth = ethOut - ethIn
    amountInRaw = humanToRaw(ethIn, 18)
    amountOutRaw = humanToRaw(ethOut, 18)
    tokenIn = WETH_BY_CHAIN
    tokenOut = WETH_BY_CHAIN
    symbolIn = "ETH"
    symbolOut = "ETH"
    summary = `swap ${ethIn.toFixed(6)} ETH → ${ethOut.toFixed(6)} ETH (${effMult.toFixed(3)}×)`
  }

  /** Burn sim gas before applying the trade delta. */
  await applyUserSimWalletDelta({
    rumbleUserId: ctx.rumbleUserIdHex,
    ethDelta: ethDelta - gasEth,
    usdcDelta,
  })

  const txHash = syntheticTxHash(ctx.idempotencyKey)
  const blockNumber = syntheticBlockNumber()
  const gasUsed = syntheticGasUsed(rng, "swap")
  const effectiveGasPrice = syntheticEffectiveGasPriceWei(rng, ctx.chainId)

  await insertTradingAttempt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    email: ctx.email,
    agentId: ctx.agentId,
    idempotencyKey: `${ctx.idempotencyKey}:swap`,
    kind: "swap",
    chainId: ctx.chainId,
    txHash,
    status: "ok",
    swapQuote: {
      chainId: ctx.chainId,
      amountInRaw,
      amountOutRaw,
      tokenIn,
      tokenOut,
      tokenInDecimals: symbolIn === "ETH" ? 18 : 6,
      tokenOutDecimals: symbolOut === "ETH" ? 18 : 6,
      symbolIn,
      symbolOut,
      evaluatedAtMs: Date.now(),
    },
  })

  await upsertOnchainReceipt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    chainId: ctx.chainId,
    txHash,
    blockNumber,
    gasUsed,
    effectiveGasPrice,
    status: "success",
    agentId: ctx.agentId,
    walletAddress: ctx.walletAddress,
    arenaPoolId: decision.target.kind === "arena" ? decision.target.arenaPoolId : undefined,
    source: "poll",
    excerpt: "sim",
  })

  const narrative = economics?.narrative?.trim() || summary
  return {
    ok: true,
    txHash,
    summary: narrative,
    pnlEth,
    outcomeMultiplier: effMult,
    gasEth,
    narrative,
  }
}

async function simulateLpIncrease(input: SimulateAgentInput & Extra): Promise<SimulateOutcome> {
  if (input.decision.type !== "lp_increase") {
    return { ok: false, summary: "unsupported_decision" }
  }
  const { decision, ctx, spotUsd, economics, simWallet, rng, gasEth } = input

  const ethUsd = Math.max(spotUsd, 1)
  const targetEth = notionalEth(ctx, decision.amountPercent)
  if (targetEth <= 0) {
    return { ok: false, summary: "zero_notional" }
  }

  const ethAvailable = Math.max(0, parseNum(simWallet.ethBalance) - gasEth)
  const ethDeposit = Math.min(targetEth, ethAvailable)
  if (ethDeposit <= 0) {
    return { ok: false, summary: "sim_zero_eth_balance" }
  }

  /** Mirror real LP: bilateral deposit on eth-usdc, single-sided ETH otherwise. */
  let usdcDeposit = 0
  if (decision.target.kind === "arena" && (decision.target.arenaPoolId as ArenaPoolId) === "eth-usdc") {
    const usdcWanted = ethDeposit * ethUsd
    usdcDeposit = Math.min(usdcWanted, parseNum(simWallet.usdcBalance))
  }

  await applyUserSimWalletDelta({
    rumbleUserId: ctx.rumbleUserIdHex,
    ethDelta: -ethDeposit - gasEth,
    usdcDelta: -usdcDeposit,
  })

  await upsertOpenLpPositionAdd({
    rumbleUserId: ctx.rumbleUserIdHex,
    agentId: ctx.agentId,
    poolKey: poolKeyForDecision(decision),
    arenaPoolId: decision.target.kind === "arena" ? decision.target.arenaPoolId : undefined,
    labPoolId: decision.target.kind === "lab" ? decision.target.labPoolId : undefined,
    ethDelta: ethDeposit,
    usdcDelta: usdcDeposit,
    chartLow: decision.chartLow,
    chartHigh: decision.chartHigh,
  })

  const txHash = syntheticTxHash(ctx.idempotencyKey)
  const gasUsed = syntheticGasUsed(rng, "lp_increase")
  const effectiveGasPrice = syntheticEffectiveGasPriceWei(rng, ctx.chainId)

  await insertTradingAttempt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    email: ctx.email,
    agentId: ctx.agentId,
    idempotencyKey: `${ctx.idempotencyKey}:lp_increase`,
    kind: "lp_increase",
    chainId: ctx.chainId,
    txHash,
    status: "ok",
  })

  await upsertOnchainReceipt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    chainId: ctx.chainId,
    txHash,
    blockNumber: syntheticBlockNumber(),
    gasUsed,
    effectiveGasPrice,
    status: "success",
    agentId: ctx.agentId,
    walletAddress: ctx.walletAddress,
    arenaPoolId: decision.target.kind === "arena" ? decision.target.arenaPoolId : undefined,
    source: "poll",
    excerpt: "sim",
  })

  const narrative =
    economics?.narrative?.trim() ||
    `add LP ${ethDeposit.toFixed(4)} ETH${usdcDeposit > 0 ? ` + ${usdcDeposit.toFixed(2)} USDC` : ""}`

  return {
    ok: true,
    txHash,
    summary: narrative,
    pnlEth: -gasEth, // deposit isn't realised P&L yet; only gas is.
    gasEth,
    narrative,
  }
}

async function simulateLpDecrease(input: SimulateAgentInput & Extra): Promise<SimulateOutcome> {
  if (input.decision.type !== "lp_decrease") {
    return { ok: false, summary: "unsupported_decision" }
  }
  const { decision, ctx, economics, rng, gasEth, spotUsd } = input
  const bands = getRiskBands(ctx.config.riskLevel)

  const pct = clampPercent(decision.amountPercent, 50)
  const reduce = await reduceOpenLpPosition({
    rumbleUserId: ctx.rumbleUserIdHex,
    agentId: ctx.agentId,
    poolKey: poolKeyForDecision(decision),
    percent: pct,
  })
  if (!reduce) {
    /** No open position to remove — record a skip-style miss but still log the decision. */
    return { ok: false, summary: "sim_no_lp_position" }
  }

  /**
   * LP fee/IL P&L applied as a fraction of the principal we just freed.
   * Capped so |pnlEth * spotUsd| never exceeds SIM_PNL_USD_CAP — keeps
   * individual LP-trim rows in the same ±$2 visual band as swaps.
   */
  const ethUsd = Math.max(spotUsd, 1)
  const principalUsd =
    reduce.ethWithdrawn * ethUsd + reduce.usdcWithdrawn /* USDC ≈ $1 */
  const rawFeeFrac = rollInBand(rng, bands.lpFee)
  const feeFrac = capMultiplierToPnlUsd({
    rawMult: 1 + rawFeeFrac,
    tradeUsdGross: principalUsd,
    cap: SIM_PNL_USD_CAP,
  }) - 1

  const ethReturn = reduce.ethWithdrawn * (1 + feeFrac)
  const usdcReturn = reduce.usdcWithdrawn * (1 + feeFrac)

  await applyUserSimWalletDelta({
    rumbleUserId: ctx.rumbleUserIdHex,
    ethDelta: ethReturn - gasEth,
    usdcDelta: usdcReturn,
  })

  const txHash = syntheticTxHash(ctx.idempotencyKey)
  const gasUsed = syntheticGasUsed(rng, "lp_decrease")
  const effectiveGasPrice = syntheticEffectiveGasPriceWei(rng, ctx.chainId)

  await insertTradingAttempt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    email: ctx.email,
    agentId: ctx.agentId,
    idempotencyKey: `${ctx.idempotencyKey}:lp_decrease`,
    kind: "lp_decrease",
    chainId: ctx.chainId,
    txHash,
    status: "ok",
  })

  await upsertOnchainReceipt({
    rumbleUserIdHex: ctx.rumbleUserIdHex,
    chainId: ctx.chainId,
    txHash,
    blockNumber: syntheticBlockNumber(),
    gasUsed,
    effectiveGasPrice,
    status: "success",
    agentId: ctx.agentId,
    walletAddress: ctx.walletAddress,
    arenaPoolId: decision.target.kind === "arena" ? decision.target.arenaPoolId : undefined,
    source: "poll",
    excerpt: "sim",
  })

  const pnlEth = ethReturn - reduce.ethWithdrawn // ETH-side P&L (USDC fee accrual flows separately)
  const narrative =
    economics?.narrative?.trim() ||
    `remove LP ${pct}% (${(feeFrac * 100).toFixed(2)}% net fees${reduce.closed ? ", closed" : ""})`

  return {
    ok: true,
    txHash,
    summary: narrative,
    pnlEth,
    outcomeMultiplier: 1 + feeFrac,
    gasEth,
    narrative,
  }
}

function parseNum(s: string | undefined): number {
  if (!s) return 0
  const n = Number.parseFloat(String(s))
  return Number.isFinite(n) ? n : 0
}

function humanToRaw(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0"
  const fixed = amount.toFixed(Math.min(36, Math.max(0, decimals)))
  const [whole = "0", frac = ""] = fixed.split(".")
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals)
  const wholeBn = BigInt(whole.replace(/^0+(?=\d)/, "") || "0")
  let scale = BigInt(1)
  for (let i = 0; i < decimals; i++) scale *= BigInt(10)
  return (wholeBn * scale + BigInt(padded || "0")).toString()
}
