import type { AgentActivityEvent } from "@/components/dashboard/activity-types"

export type AgentStatus = "running" | "paused"

export type AgentConfig = {
  name: string
  goal: string
  capital: string
  token: string
  chain: string
  pool: string
  slippage: string
  gasCap: string
  betAmount: string
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
  totals: AgentTotals
  activity: AgentActivityEvent[]
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: "arena-alpha",
  goal: "Maximize yield on ETH/USDC with tight ranges when volatility is low.",
  capital: "2.5",
  token: "ETH",
  chain: "base-sepolia",
  pool: "ETH / USDC · 0.05%",
  slippage: "0.5",
  gasCap: "45",
  betAmount: "0.10",
}
