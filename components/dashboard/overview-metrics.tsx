"use client"

import { useMemo } from "react"
import { formatSignedUsd } from "@/components/dashboard/pnl-usdc"
import type { Agent } from "@/lib/agents/agent-types"
import {
  computeOverviewMetrics,
  type DashboardOverviewMetrics,
} from "@/lib/dashboard/overview-metrics"

type Props = {
  agents: Agent[]
  /** From `GET /api/dashboard/overview` — persisted Mongo aggregates when logged in. */
  overview?: DashboardOverviewMetrics | null
  /** True until the first overview request settles (success or error). */
  overviewLoading?: boolean
  /** When true, plates prefer API metrics once `overview` is set; otherwise local-only. */
  overviewReady?: boolean
}

export function OverviewMetrics({
  agents,
  overview,
  overviewLoading = false,
  overviewReady = false,
}: Props) {
  const local = useMemo(() => computeOverviewMetrics(agents), [agents])
  const useRemote = overviewReady && overview !== null
  const m: DashboardOverviewMetrics = useRemote && overview ? overview : local

  const cards = [
    { label: "Agents", value: `${m.agentCount}`, sub: `${m.runningCount} running` },
    {
      label: "Total PnL",
      value: formatSignedUsd(m.totalNetPnlUsd),
      sub: useRemote ? "all agents · net USD · Mongo" : "all agents · local estimate",
      accent: m.totalNetPnlUsd >= 0 ? "text-emerald-700" : "text-red-700",
    },
    {
      label: "Actions",
      value: `${m.totalActions}`,
      sub: `${m.totalFills} fills · ${m.totalSkips} skips`,
    },
    { label: "Win rate", value: `${(m.winRate * 100).toFixed(0)}%`, sub: "fills / (fills + skips)" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className={`rounded-2xl border border-black/[0.07] bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.04)] ${
            overviewLoading && !useRemote ? "animate-pulse opacity-90" : ""
          }`}
        >
          <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">{c.label}</p>
          <p
            className={`mt-1 text-lg md:text-xl tabular-nums font-medium ${c.accent ?? "text-[#111]"}`}
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            {c.value}
          </p>
          <p className="text-[10px] text-black/40 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
