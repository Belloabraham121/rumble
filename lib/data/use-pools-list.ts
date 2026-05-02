"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ArenaPoolsListPayload } from "@/lib/data/pool-data-types"

export type UsePoolsListResult = {
  data: ArenaPoolsListPayload | null
  loading: boolean
  ready: boolean
  refresh: () => void
}

export function usePoolsList(intervalMs: number = 20_000): UsePoolsListResult {
  const [data, setData] = useState<ArenaPoolsListPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const cancelRef = useRef(false)

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/data/pools", { credentials: "same-origin" })
      if (cancelRef.current) return
      if (!res.ok) return
      const body = (await res.json()) as ArenaPoolsListPayload
      setData(body)
      setReady(true)
    } catch {
      // swallow — next poll will retry
    } finally {
      if (!cancelRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelRef.current = false
    void fetchOnce()
    const id = window.setInterval(() => {
      void fetchOnce()
    }, intervalMs)
    return () => {
      cancelRef.current = true
      window.clearInterval(id)
    }
  }, [fetchOnce, intervalMs])

  return {
    data,
    loading,
    ready,
    refresh: () => {
      void fetchOnce()
    },
  }
}
