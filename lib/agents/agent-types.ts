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
  /** User reminder for how they funded the agent (shown next to on-chain wallet). */
  fundingNotes: string
  /**
   * Server-synced: removing an enabled pool may leave LP behind — surfaced in the capsule.
   * Cleared on the next sync when no longer applicable.
   */
  poolRemovalWarnings?: string[]
  /** When true, agent may use every canonical arena pool (`mechanics.md`). */
  tradeAllPools: boolean
  /** Subset of arena pool ids — ignored when `tradeAllPools` is true. */
  enabledPoolIds: ArenaPoolId[]
  /**
   * User-deployed lab pools this agent is allowed to trade (auto-registered
   * on successful `/lp/create`, shape defined in `@/lib/agents/lab-pools`).
   * Ignored by `tradeAllPools` (always opt-in per-agent).
   */
  enabledLabPoolIds: string[]
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
  fundingNotes: "",
  tradeAllPools: false,
  enabledPoolIds: ["eth-usdc"],
  enabledLabPoolIds: [],
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

  const legacyPartial = partial as Record<string, unknown>
  if (typeof legacyPartial.fundingNotes === "string") {
    merged.fundingNotes = legacyPartial.fundingNotes
  } else if (typeof legacyPartial.fundingWalletNote === "string") {
    merged.fundingNotes = legacyPartial.fundingWalletNote
  }

  if (!partial.enabledPoolIds || !Array.isArray(partial.enabledPoolIds)) {
    merged.enabledPoolIds = [inferArenaPoolFromLegacyFields(merged).id]
  } else {
    merged.enabledPoolIds = normalizeEnabledPoolIds(partial.enabledPoolIds)
  }

  if (Array.isArray(partial.enabledLabPoolIds)) {
    const seen = new Set<string>()
    merged.enabledLabPoolIds = partial.enabledLabPoolIds
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0 && !seen.has(x) && (seen.add(x), true))
      .slice(0, 50)
  } else {
    merged.enabledLabPoolIds = []
  }

  const primary =
    getTradableArenaPools(merged.tradeAllPools, merged.enabledPoolIds)[0] ??
    inferArenaPoolFromLegacyFields(merged)
  merged.basePair = primary.basePair
  merged.feeTier = primary.feeTier
  merged.pool = formatPoolLabel(primary.basePair, primary.feeTier)

  delete (merged as Record<string, unknown>).runtimeBoxesLive

  const VALID_CHAINS: AgentConfig["chain"][] = [
    "base-sepolia",
    "base-mainnet",
    "unichain-sepolia",
    "unichain-mainnet",
  ]
  if (!VALID_CHAINS.includes(merged.chain as AgentConfig["chain"])) {
    merged.chain = DEFAULT_AGENT_CONFIG.chain
  }

  const clampStr = (raw: string, min: number, max: number, fallback: string): string => {
    const n = Number.parseFloat(String(raw).trim())
    if (!Number.isFinite(n)) return fallback
    return String(Math.min(max, Math.max(min, n)))
  }

  merged.capital = clampStr(merged.capital, 0, 1e12, DEFAULT_AGENT_CONFIG.capital)
  merged.slippage = clampStr(merged.slippage, 0, 50, DEFAULT_AGENT_CONFIG.slippage)
  merged.gasCap = clampStr(merged.gasCap, 1, 5000, DEFAULT_AGENT_CONFIG.gasCap)
  merged.maxPositionPercent = clampStr(merged.maxPositionPercent, 1, 100, DEFAULT_AGENT_CONFIG.maxPositionPercent)
  merged.betAmount = clampStr(merged.betAmount, 0, 1000, DEFAULT_AGENT_CONFIG.betAmount)
  merged.reflectionFrequencyTrades = clampStr(
    merged.reflectionFrequencyTrades,
    1,
    10_000,
    DEFAULT_AGENT_CONFIG.reflectionFrequencyTrades,
  )

  if (!merged.approvedTokens?.trim()) {
    merged.approvedTokens = DEFAULT_AGENT_CONFIG.approvedTokens
  }
  if (!merged.name?.trim()) {
    merged.name = DEFAULT_AGENT_CONFIG.name
  }
  if (!merged.version?.trim()) {
    merged.version = DEFAULT_AGENT_CONFIG.version
  }
  if (!(["conservative", "balanced", "aggressive"] as const).includes(merged.riskLevel)) {
    merged.riskLevel = DEFAULT_AGENT_CONFIG.riskLevel
  }
  if (!(["light", "standard", "deep"] as const).includes(merged.reflectionDepth)) {
    merged.reflectionDepth = DEFAULT_AGENT_CONFIG.reflectionDepth
  }
  if (merged.goal.length > 8000) {
    merged.goal = merged.goal.slice(0, 8000)
  }
  if (merged.fundingNotes.length > 2000) {
    merged.fundingNotes = merged.fundingNotes.slice(0, 2000)
  }

  return merged
}

export function migratePriceBox(b: PriceBox): PriceBox {
  let low = Number.isFinite(b.low) ? b.low : 50
  let high = Number.isFinite(b.high) ? b.high : 55
  if (low > high) {
    const t = low
    low = high
    high = t
  }
  return {
    ...b,
    low,
    high,
    amountPercent: b.amountPercent ?? "33",
  }
}
