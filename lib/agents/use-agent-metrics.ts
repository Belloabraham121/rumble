"use client"

import { useEffect, useState } from "react"
import type { AgentMetricsSnapshot, MetricsRange } from "@/lib/agents/metrics-types"

export type UseAgentMetricsOptions = {
  /** When &gt; 0, refetches on this interval without toggling the loading state. */
  pollMs?: number
}

export function useAgentMetrics(
  agentId: string | undefined,
  range: MetricsRange,
  options?: UseAgentMetricsOptions,
) {
  const pollMs = options?.pollMs ?? 0
  const [metrics, setMetrics] = useState<AgentMetricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId) {
      setMetrics(null)
      setLoading(false)
      setError(null)
      return
    }

    const resolvedAgentId = agentId
    let cancelled = false

    async function load(initial: boolean) {
      if (initial) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(resolvedAgentId)}/metrics?range=${encodeURIComponent(range)}`,
          { credentials: "same-origin" },
        )
        if (!res.ok) {
          if (!cancelled && initial) {
            setMetrics(null)
            setError(res.status === 404 ? "not_found" : "fetch_failed")
          }
          return
        }
        const data = (await res.json()) as { metrics: AgentMetricsSnapshot }
        if (!cancelled) setMetrics(data.metrics)
      } catch {
        if (!cancelled && initial) {
          setMetrics(null)
          setError("fetch_failed")
        }
      } finally {
        if (!cancelled && initial) setLoading(false)
      }
    }

    void load(true)

    if (pollMs > 0) {
      const id = window.setInterval(() => {
        void load(false)
      }, pollMs)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    return () => {
      cancelled = true
    }
  }, [agentId, range, pollMs])

  return { metrics, loading, error }
}

export function useAgentsMetricsBatch(agentIds: string[], range: MetricsRange) {
  const [byId, setById] = useState<Record<string, AgentMetricsSnapshot>>({})
  const [loading, setLoading] = useState(true)

  const key = [...new Set(agentIds)].filter(Boolean).sort().join(",")

  useEffect(() => {
    if (!key) {
      setById({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const qs = new URLSearchParams({ range, ids: key })
        const res = await fetch(`/api/agents/metrics?${qs}`, { credentials: "same-origin" })
        if (!res.ok) {
          if (!cancelled) setById({})
          return
        }
        const data = (await res.json()) as { metrics: Record<string, AgentMetricsSnapshot> }
        if (!cancelled) setById(data.metrics ?? {})
      } catch {
        if (!cancelled) setById({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, range])

  return { byId, loading }
}
