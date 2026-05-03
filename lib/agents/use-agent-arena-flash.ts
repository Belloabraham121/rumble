"use client"

import { useEffect, useRef, useState } from "react"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"

export type ServerArenaFlashState = {
  hit: boolean
  mult: number
  payoutEth: number
  at: number
} | null

/** Polls `/api/agents/:id/runs?since=` — drives chart EXECUTED overlay from real `agent_runs` (swap hits). */
export function useAgentArenaFlash(agentId: string | undefined, arenaPoolId: ArenaPoolId | null) {
  const [flash, setFlash] = useState<ServerArenaFlashState>(null)
  const seenRef = useRef(new Set<string>())
  const sinceRef = useRef<Date>(new Date(Date.now() - 8000))

  useEffect(() => {
    if (!agentId || !arenaPoolId) return

    seenRef.current = new Set()
    sinceRef.current = new Date(Date.now() - 8000)

    let cancelled = false

    const poll = async () => {
      try {
        const url = `/api/agents/${encodeURIComponent(agentId)}/runs?since=${encodeURIComponent(sinceRef.current.toISOString())}&limit=80`
        const r = await fetch(url, { credentials: "same-origin" })
        if (!r.ok || cancelled) return
        const j = (await r.json()) as {
          runs?: Array<{
            id: string
            createdAt: string
            arenaPoolId?: string
            arena: { outcome: string; mult: number; payoutEth: number }
          }>
        }
        const runs = j.runs ?? []
        let maxT = sinceRef.current
        for (const run of runs) {
          const t = new Date(run.createdAt)
          if (!Number.isNaN(t.getTime()) && t > maxT) maxT = t
          if (run.arenaPoolId !== arenaPoolId) continue
          if (run.arena.outcome !== "hit") continue
          if (seenRef.current.has(run.id)) continue
          seenRef.current.add(run.id)
          setFlash({
            hit: true,
            mult: run.arena.mult,
            payoutEth: run.arena.payoutEth,
            at: Date.now(),
          })
        }
        sinceRef.current = maxT
      } catch {
        // ignore
      }
    }

    const id = window.setInterval(poll, 2800)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [agentId, arenaPoolId])

  return flash
}
