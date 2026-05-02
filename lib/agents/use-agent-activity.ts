"use client"

import { useCallback, useEffect, useState } from "react"
import type { AgentActivityEvent } from "@/components/dashboard/activity-types"

export function useAgentActivity(agentId: string | undefined, pollMs = 12_000) {
  const [events, setEvents] = useState<AgentActivityEvent[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    try {
      const r = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/activity?limit=80`,
        { credentials: "same-origin" },
      )
      if (!r.ok) return
      const j = (await r.json()) as { events?: AgentActivityEvent[] }
      if (Array.isArray(j.events)) setEvents(j.events)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      return
    }
    let cancelled = false
    void reload().then(() => {
      if (cancelled) return
    })
    const id = window.setInterval(() => {
      void reload()
    }, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [agentId, pollMs, reload])

  return { events, loading, reload }
}
