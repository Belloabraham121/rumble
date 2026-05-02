"use client"

import { formatPnlUsdc } from "@/components/dashboard/pnl-usdc"
import type { Agent } from "@/lib/agents/agent-types"

type Props = {
  agents: Agent[]
}

export function OverviewMetrics({ agents }: Props) {
  const running = agents.filter(a => a.status === "running").length
  const totalPnl = agents.reduce((acc, a) => acc + a.totals.pnlEth, 0)
  const totalActions = agents.reduce((acc, a) => acc + a.totals.fills + a.totals.skips, 0)
  const totalFills = agents.reduce((acc, a) => acc + a.totals.fills, 0)
  const winRate = totalActions > 0 ? totalFills / totalActions : 0

  const cards = [
    { label: "Agents", value: `${agents.length}`, sub: `${running} running` },
    {
      label: "Total PnL",
      value: formatPnlUsdc(totalPnl),
      sub: "all agents · simulated · ETH→USDC @ ref",
      accent: totalPnl >= 0 ? "text-emerald-700" : "text-red-700",
    },
    { label: "Actions", value: `${totalActions}`, sub: `${totalFills} fills · ${totalActions - totalFills} skips` },
    { label: "Win rate", value: `${(winRate * 100).toFixed(0)}%`, sub: "fills / total" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className="rounded-2xl border border-black/[0.07] bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
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
