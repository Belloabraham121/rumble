import type { AgentActivityEvent } from "@/components/dashboard/activity-types"
import type { PriceBox } from "@/components/dashboard/types"
import {
  getTradableArenaPools,
  inferArenaPoolFromLegacyFields,
  normalizeEnabledPoolIds,
  type ArenaPoolId,
} from "@/lib/agents/arena-pools"

export type AgentStatus = "running" | "paused"

export type RiskLevel = "conservative" | "balanced" | "aggressive"
export type ReflectionDepth = "light" | "standard" | "deep"

/** Full agent configuration — mirrors `agent.md`; persisted via `/api/agents` when Mongo + session sync. */
export type AgentConfig = {
  name: string
  goal: string
  /** Semantic version shown in UI (`agent.md` §3). */
  version: string
  riskLevel: RiskLevel
  /** Target operating capital (same denomination as `token`). */
  capital: string
  token: string
  chain: string
  /** Base pair label, e.g. ETH / USDC */
  basePair: string
  /** Pool fee tier label */
  feeTier: string
  /** Composite display: `{basePair} · {feeTier}` — kept in sync in the UI. */
  pool: string
  slippage: string
  gasCap: string
  /** Max position size per action as % of capital (`agent.md` guardrails). */
  maxPositionPercent: string
  /** Comma-separated approved symbols for swaps/LP */
  approvedTokens: string
  betAmount: string
  /** Run reflection every N trades (`agent.md` runtime). */
  reflectionFrequencyTrades: string
  reflectionDepth: ReflectionDepth
  /** Placeholder copy until real wallet is wired */
  fundingWalletNote: string
  /**
   * When true, low / high / action / amount % drift on a timer so you can preview
   * dynamic runtime behavior (UI-only; no backend).
   */
  runtimeBoxesLive: boolean
  /** When true, agent may use every canonical arena pool (`mechanics.md`). */
  tradeAllPools: boolean
  /** Subset of arena pool ids — ignored when `tradeAllPools` is true. */
  enabledPoolIds: ArenaPoolId[]
}

export type AgentTotals = {
  pnlEth: number
  gasGwei: number
  fills: number
  skips: number
}

export type Agent = {
  id: string
  status: AgentStatus
  createdAt: number
  config: AgentConfig
  /** Runtime price boxes (`agent.md` §4 — editable while running). */
  boxes: PriceBox[]
  totals: AgentTotals
  activity: AgentActivityEvent[]
}

export const BASE_PAIR_OPTIONS = ["ETH / USDC", "ETH / USDT", "WETH / USDC", "cbETH / ETH"] as const
export const FEE_TIER_OPTIONS = ["0.01%", "0.05%", "0.3%", "1%"] as const
export const CHAIN_OPTIONS = [
  { value: "base-sepolia", label: "Base Sepolia" },
  { value: "unichain-sepolia", label: "Unichain Sepolia" },
] as const

export function formatPoolLabel(basePair: string, feeTier: string): string {
  return `${basePair.trim()} · ${feeTier.trim()}`
}

export const DEFAULT_RUNTIME_BOXES: PriceBox[] = [
  {
    id: "demo-1",
    label: "Add LP",
    low: 48,
    high: 54,
    action: "add_liquidity",
    color: "#6366f1",
    hitLabel: "+0.5 ETH + 1.2k USDC in range",
    amountPercent: "40",
  },
  {
    id: "demo-2",
    label: "Swap partial",
    low: 55,
    high: 59,
    action: "swap",
    color: "#c084fc",
    hitLabel: "−0.2 ETH → +610 USDC",
    amountPercent: "35",
  },
  {
    id: "demo-3",
    label: "Claim / trim",
    low: 60,
    high: 65,
    action: "remove_liquidity",
    color: "#38bdf8",
    hitLabel: "+$180 fees · −15% range width",
    amountPercent: "25",
  },
]

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: "arena-alpha",
  goal: "Maximize yield on ETH/USDC with tight ranges when volatility is low.",
  version: "1.0.0",
  riskLevel: "balanced",
  capital: "2.5",
  token: "ETH",
  chain: "base-sepolia",
  basePair: "ETH / USDC",
  feeTier: "0.05%",
  pool: "ETH / USDC · 0.05%",
  slippage: "0.5",
  gasCap: "45",
  maxPositionPercent: "25",
  approvedTokens: "ETH, USDC, WETH",
  betAmount: "0.10",
  reflectionFrequencyTrades: "25",
  reflectionDepth: "standard",
  fundingWalletNote: "",
  runtimeBoxesLive: false,
  tradeAllPools: false,
  enabledPoolIds: ["eth-usdc"],
}

/** Merge persisted config with current schema (localStorage migration). */
export function migrateAgentConfig(partial: Partial<AgentConfig> & Record<string, unknown>): AgentConfig {
  const merged: AgentConfig = {
    ...DEFAULT_AGENT_CONFIG,
    ...(partial as AgentConfig),
  }
  // Legacy: only `pool` string — try to split into base pair + fee tier
  if (
    partial &&
    typeof partial.pool === "string" &&
    partial.pool.includes(" · ") &&
    (!partial.basePair || !partial.feeTier)
  ) {
    const idx = partial.pool.lastIndexOf(" · ")
    if (idx > 0) {
      merged.basePair = partial.pool.slice(0, idx).trim()
      merged.feeTier = partial.pool.slice(idx + 3).trim()
    }
  }
  merged.tradeAllPools = typeof partial.tradeAllPools === "boolean" ? partial.tradeAllPools : false

  if (!partial.enabledPoolIds || !Array.isArray(partial.enabledPoolIds)) {
    merged.enabledPoolIds = [inferArenaPoolFromLegacyFields(merged).id]
  } else {
    merged.enabledPoolIds = normalizeEnabledPoolIds(partial.enabledPoolIds)
  }

  const primary =
    getTradableArenaPools(merged.tradeAllPools, merged.enabledPoolIds)[0] ??
    inferArenaPoolFromLegacyFields(merged)
  merged.basePair = primary.basePair
  merged.feeTier = primary.feeTier
  merged.pool = formatPoolLabel(primary.basePair, primary.feeTier)
  return merged
}

export function migratePriceBox(b: PriceBox): PriceBox {
  return {
    ...b,
    amountPercent: b.amountPercent ?? "33",
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Simulated drift for live runtime preview (`runtimeBoxesLive`). */
export function perturbRuntimePriceBoxes(boxes: PriceBox[]): PriceBox[] {
  const actions: PriceBox["action"][] = ["add_liquidity", "swap", "remove_liquidity"]
  const jitter = () => (Math.random() - 0.5) * 1.5

  return boxes.map(b => {
    let low = round1(b.low + jitter())
    let high = round1(b.high + jitter())
    if (low >= high - 1) {
      high = round1(low + 2 + Math.random() * 4)
    }
    low = clamp(low, 38, 70)
    high = clamp(high, low + 2, 76)

    const baseAmt = Number.parseInt(b.amountPercent ?? "33", 10)
    const amt = clamp(Number.isFinite(baseAmt) ? baseAmt : 33, 10, 90)
    const nextAmt = clamp(Math.round(amt + (Math.random() - 0.5) * 10), 10, 90)

    const action =
      Math.random() < 0.14 ? actions[Math.floor(Math.random() * actions.length)]! : b.action

    return {
      ...b,
      low,
      high,
      action,
      amountPercent: String(nextAmt),
    }
  })
}
