"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { LivePricePayload } from "@/lib/data/pool-data-types"

export type UsePoolLivePriceOptions = {
  /** Interval between polls when the tab is visible. Default 6000ms. */
  intervalMs?: number
  /** Pause polling. */
  paused?: boolean
}

export type UsePoolLivePriceResult = {
  price: number | null
  raw: LivePricePayload | null
  /** True while the first successful response is outstanding. */
  loading: boolean
  /** True if at least one successful response arrived. */
  ready: boolean
  /** True when backend has no live data yet (subgraph unset or cron not warmed). */
  unavailable: boolean
  stale: boolean
  source: "subgraph" | "stale" | "unavailable"
  fetchedAt: Date | null
  refresh: () => void
}

/**
 * Polls `/api/data/pools/[arenaPoolId]/price` every `intervalMs`. Works with either a
 * real `ArenaPoolId` or `null` (returns the idle result so consumers can always call it).
 */
export function usePoolLivePrice(
  arenaPoolId: ArenaPoolId | null | undefined,
  { intervalMs = 6000, paused = false }: UsePoolLivePriceOptions = {},
): UsePoolLivePriceResult {
  const [raw, setRaw] = useState<LivePricePayload | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(arenaPoolId))
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const cancelRef = useRef(false)

  const fetchOnce = useCallback(async () => {
    if (!arenaPoolId) return
    try {
      const res = await fetch(`/api/data/pools/${arenaPoolId}/price`, {
        credentials: "same-origin",
      })
      if (cancelRef.current) return
      if (res.status === 503 || res.status === 404) {
        setUnavailable(true)
        setReady(true)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as LivePricePayload
      setRaw(data)
      setUnavailable(false)
      setReady(true)
    } catch {
      // swallow — next poll will retry
    } finally {
      if (!cancelRef.current) setLoading(false)
    }
  }, [arenaPoolId])

  useEffect(() => {
    cancelRef.current = false
    if (!arenaPoolId || paused) {
      setLoading(false)
      return () => {
        cancelRef.current = true
      }
    }
    setLoading(true)
    void fetchOnce()
    const id = window.setInterval(() => {
      void fetchOnce()
    }, intervalMs)
    return () => {
      cancelRef.current = true
      window.clearInterval(id)
    }
  }, [arenaPoolId, intervalMs, paused, fetchOnce])

  const parsed = raw?.displayUsd ? Number(raw.displayUsd) : null
  /** Ignore subgraph zeros — treat as missing so UI can fall back / hold last good price. */
  const price =
    parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null

  return {
    price,
    raw,
    loading,
    ready,
    unavailable,
    stale: Boolean(raw?.stale),
    source: unavailable ? "unavailable" : (raw?.source ?? "stale"),
    fetchedAt: raw?.fetchedAt ? new Date(raw.fetchedAt) : null,
    refresh: () => {
      void fetchOnce()
    },
  }
}
