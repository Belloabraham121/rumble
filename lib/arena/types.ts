/** One ranked row on the arena leaderboard (Phase 5). */
export type ArenaLeaderboardEntry = {
  rank: number
  agentId: string
  rumbleUserIdHex: string
  displayName: string
  poolLabel: string
  pnlNetUsd: number
  winRate: number
  actions: number
  score: number
}

/** Public JSON row — omits `rumbleUserIdHex`. */
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
