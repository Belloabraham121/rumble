"use client"

import { useEffect, useRef } from "react"

/**
 * While the dashboard is open and the agent status is **running**, periodically POST
 * `/api/agents/[agentId]/tick` with the user session. On Vercel **Hobby**, project
 * crons are limited to **at most once per day** — frequent ticks while browsing
 * must come from this client driver (not `vercel.json`).
 *
 * Default `intervalMs` is 1s for the live-sim dashboard. The `busy` guard prevents
 * overlap if a tick takes longer than the interval (e.g. an LLM call), so increasing
 * frequency is safe — slow ticks just back off naturally.
 */
export function useAgentTickWhileRunning(
  agentId: string | undefined,
  running: boolean,
  intervalMs = 1_000,
) {
  const busy = useRef(false)

  useEffect(() => {
    if (!agentId || !running) return

    const tick = async () => {
      if (busy.current) return
      busy.current = true
      try {
        await fetch(`/api/agents/${encodeURIComponent(agentId)}/tick`, {
          method: "POST",
          credentials: "same-origin",
        })
      } catch {
        // network — next interval retries
      } finally {
        busy.current = false
      }
    }

    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [agentId, running, intervalMs])
}
