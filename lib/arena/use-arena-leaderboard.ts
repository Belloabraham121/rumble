"use client"

import { useEffect, useMemo, useState } from "react"
import type { ArenaAgentRow } from "@/components/dashboard/activity-types"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { ArenaLeaderboardPublicEntry } from "@/lib/arena/types"

export type UseArenaLeaderboardResult = {
  agents: ArenaAgentRow[]
  loading: boolean
  error: string | null
  refreshedAt: string | null
}

function mapEntry(e: ArenaLeaderboardPublicEntry): ArenaAgentRow {
  return {
    id: e.agentId,
    name: e.displayName,
    pool: e.poolLabel,
    pnlEth: 0,
    pnlNetUsd: e.pnlNetUsd,
    winRate: e.winRate,
    actions: e.actions,
    score: Math.round(e.score),
  }
}

export function useArenaLeaderboard(input: {
  arenaPoolId: ArenaPoolId | null | undefined
  chainId: number
  /** Ensures this agent appears when outside the top slice (optional). */
  highlightAgentId?: string
  limit?: number
  /** When set, re-fetches the board on an interval (background refresh, no extra loading flash). */
  refreshIntervalMs?: number
}): UseArenaLeaderboardResult {
  const [agents, setAgents] = useState<ArenaAgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const qs = useMemo(() => {
    if (!input.arenaPoolId) return ""
    const u = new URLSearchParams({
      arenaPoolId: input.arenaPoolId,
      chainId: String(input.chainId),
      range: "30d",
      limit: String(input.limit ?? 20),
    })
    if (input.highlightAgentId) {
      u.set("highlightAgentId", input.highlightAgentId)
    }
    return u.toString()
  }, [input.arenaPoolId, input.chainId, input.highlightAgentId, input.limit])

  const refreshIntervalMs = input.refreshIntervalMs ?? 0

  useEffect(() => {
    if (!input.arenaPoolId || !qs) {
      setAgents([])
      setLoading(false)
      setError(null)
      setRefreshedAt(null)
      return
    }

    let cancelled = false

    async function load(initial: boolean) {
      if (initial) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetch(`/api/arena/leaderboard?${qs}`, {
          credentials: "same-origin",
        })
        if (!res.ok) {
          if (!cancelled && initial) {
            setAgents([])
            setError(res.status === 503 ? "unavailable" : "fetch_failed")
          }
          return
        }
        const data = (await res.json()) as {
          entries?: ArenaLeaderboardPublicEntry[]
          updatedAt?: string
        }
        if (!cancelled) {
          setAgents((data.entries ?? []).map(mapEntry))
          setRefreshedAt(data.updatedAt ?? null)
        }
      } catch {
        if (!cancelled && initial) {
          setAgents([])
          setError("fetch_failed")
        }
      } finally {
        if (!cancelled && initial) setLoading(false)
      }
    }

    void load(true)

    if (refreshIntervalMs <= 0) {
      return () => {
        cancelled = true
      }
    }

    const intervalId = window.setInterval(() => {
      void load(false)
    }, refreshIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [input.arenaPoolId, qs, refreshIntervalMs])

  return { agents, loading, error, refreshedAt }
}
