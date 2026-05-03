"use client"

import { useEffect, useState } from "react"
import type { LabPoolDef } from "@/lib/agents/lab-pools"

type Props = {
  selectedIds: string[]
  onToggle: (labPoolId: string) => void
  /** Hide the whole section when `tradeAllPools` is on — the arena section already handles that copy. */
  disabled?: boolean
}

/**
 * Renders the user's registered lab pools as a multi-select. Lab pools are
 * auto-registered by the Liquidity Lab on successful `/lp/create`, so this
 * list grows without extra UI.
 */
export function LabPoolPicker({ selectedIds, onToggle, disabled }: Props) {
  const [pools, setPools] = useState<LabPoolDef[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/lab-pools", { credentials: "same-origin" })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const json = (await res.json()) as { pools?: LabPoolDef[] }
        if (!cancelled) {
          setPools(Array.isArray(json.pools) ? json.pools : [])
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load_failed")
          setPools([])
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (disabled) return null

  return (
    <div className="rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[9px] tracking-widest text-black/35 uppercase">Lab pools (yours)</p>
        {pools && (
          <span className="text-[9px] text-black/35">
            {pools.length} registered
          </span>
        )}
      </div>

      {pools === null && (
        <p className="text-[10px] text-black/40">Loading…</p>
      )}

      {error && (
        <p className="text-[10px] text-red-600/80">Could not load lab pools: {error}</p>
      )}

      {pools && pools.length === 0 && !error && (
        <p className="text-[10px] text-black/40 leading-snug">
          You haven&apos;t registered any lab pools yet. Create a v4 pool in the Liquidity Lab to see it here.
        </p>
      )}

      {pools && pools.length > 0 && (
        <div className="space-y-1.5">
          {pools.map(p => {
            const checked = selectedIds.includes(p.labPoolId)
            return (
              <label key={p.labPoolId} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-black/20"
                  checked={checked}
                  onChange={() => onToggle(p.labPoolId)}
                />
                <span className="min-w-0 text-[11px] text-black/70 leading-snug">
                  <span className="block">{p.label}</span>
                  <span className="block text-[9px] text-black/40 font-mono truncate">{p.labPoolId}</span>
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
