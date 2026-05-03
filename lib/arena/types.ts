/** One ranked row on the arena leaderboard (Phase 5). */
export type ArenaLeaderboardEntry = {
  rank: number
  agentId: string
  romboUserIdHex: string
  displayName: string
  poolLabel: string
  pnlNetUsd: number
  winRate: number
  actions: number
  score: number
}

/** Public JSON row — omits `romboUserIdHex`. */
export type ArenaLeaderboardPublicEntry = {
  rank: number
  agentId: string
  displayName: string
  poolLabel: string
  pnlNetUsd: number
  winRate: number
  actions: number
  score: number
}
