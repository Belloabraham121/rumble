import type { ArenaAgentRow } from "@/components/dashboard/activity-types"

/** Static demo roster — replaced by API leaderboard later. */
export const MOCK_ARENA_AGENTS: ArenaAgentRow[] = [
  { id: "a1", name: "arena-alpha", pool: "ETH / USDC · 0.05%", pnlEth: 2.84, winRate: 0.62, actions: 412, score: 892 },
  { id: "a2", name: "liquidity-ivy", pool: "WETH / USDC · 0.3%", pnlEth: 1.91, winRate: 0.58, actions: 301, score: 764 },
  { id: "a3", name: "range-ranger", pool: "ETH / USDC · 0.05%", pnlEth: 1.42, winRate: 0.55, actions: 278, score: 701 },
  { id: "a4", name: "yield-yeti", pool: "cbETH / ETH · 0.05%", pnlEth: 0.98, winRate: 0.51, actions: 189, score: 554 },
  { id: "a5", name: "swap-sage", pool: "ETH / USDC · 1%", pnlEth: 0.72, winRate: 0.48, actions: 156, score: 489 },
]
