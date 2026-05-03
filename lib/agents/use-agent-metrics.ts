"use client"

import { useEffect, useState } from "react"
import type { AgentMetricsSnapshot, MetricsRange } from "@/lib/agents/metrics-types"

export function useAgentMetrics(agentId: string | undefined, range: MetricsRange) {
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

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/metrics?range=${encodeURIComponent(range)}`,
          { credentials: "same-origin" },
        )
        if (!res.ok) {
          if (!cancelled) {
            setMetrics(null)
            setError(res.status === 404 ? "not_found" : "fetch_failed")
          }
          return
        }
        const data = (await res.json()) as { metrics: AgentMetricsSnapshot }
        if (!cancelled) setMetrics(data.metrics)
      } catch {
        if (!cancelled) {
          setMetrics(null)
          setError("fetch_failed")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [agentId, range])

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
