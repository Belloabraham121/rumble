"use client"

import { useEffect, useRef } from "react"

/**
 * While the dashboard is open and the agent status is **running**, periodically POST
 * `/api/agents/[agentId]/tick` with the user session. Vercel cron does not run during
 * `npm run dev`, so without this nothing executes locally.
 */
export function useAgentTickWhileRunning(
  agentId: string | undefined,
  running: boolean,
  intervalMs = 60_000,
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
