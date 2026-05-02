"use client"

import { useEffect, useRef, useState } from "react"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import type { PoolCandle, PoolCandlesPayload } from "@/lib/data/pool-data-types"

export type UsePoolCandlesOptions = {
  granularity?: "minute" | "hour"
  limit?: number
}

export type UsePoolCandlesResult = {
  candles: PoolCandle[]
  loading: boolean
  ready: boolean
  unavailable: boolean
}

export function usePoolCandles(
  arenaPoolId: ArenaPoolId | null | undefined,
  { granularity = "minute", limit = 120 }: UsePoolCandlesOptions = {},
): UsePoolCandlesResult {
  const [candles, setCandles] = useState<PoolCandle[]>([])
  const [loading, setLoading] = useState<boolean>(Boolean(arenaPoolId))
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    if (!arenaPoolId) {
      setCandles([])
      setLoading(false)
      return () => {
        cancelRef.current = true
      }
    }
    setLoading(true)
    ;(async () => {
      try {
        const qs = new URLSearchParams({
          granularity,
          limit: String(limit),
        })
        const res = await fetch(`/api/data/pools/${arenaPoolId}/candles?${qs.toString()}`, {
          credentials: "same-origin",
        })
        if (cancelRef.current) return
        if (!res.ok) {
          setCandles([])
          setUnavailable(true)
          setReady(true)
          return
        }
        const data = (await res.json()) as PoolCandlesPayload
        setCandles(data.candles ?? [])
        setUnavailable(!data.configured)
        setReady(true)
      } catch {
        if (!cancelRef.current) {
          setCandles([])
          setUnavailable(true)
          setReady(true)
        }
      } finally {
        if (!cancelRef.current) setLoading(false)
      }
    })()
    return () => {
      cancelRef.current = true
    }
  }, [arenaPoolId, granularity, limit])

  return { candles, loading, ready, unavailable }
}
