"use client"

import type { ArenaAgentRow } from "@/components/dashboard/activity-types"

type Props = {
  agents: ArenaAgentRow[]
  currentAgentName?: string
}

export function DashboardArenaBoard({ agents, currentAgentName = "arena-alpha" }: Props) {
  const sorted = [...agents].sort((a, b) => b.score - a.score)
  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-black/[0.07] bg-white/95 shadow-[0_8px_28px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-black/[0.06] bg-[#fafaf8]/90">
        <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Arena</p>
        <p className="text-[10px] text-black/35 mt-0.5">Gladiator score · same pool family</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="text-black/35 border-b border-black/[0.06]">
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Agent</th>
              <th className="px-2 py-1.5 font-medium text-right">PnL</th>
              <th className="px-2 py-1.5 font-medium text-right hidden sm:table-cell">Win</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const you = a.name === currentAgentName
              return (
                <tr
                  key={a.id}
                  className={`border-b border-black/[0.04] ${you ? "bg-emerald-50/80" : "hover:bg-black/[0.02]"}`}
                >
                  <td className="px-2 py-1.5 tabular-nums text-black/40">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-[#111] font-medium">{a.name}</span>
                    {you && <span className="ml-1 text-[8px] text-emerald-700 uppercase tracking-wide">you</span>}
                    <div className="text-[9px] text-black/35 truncate max-w-[120px]">{a.pool}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-800/90">+{a.pnlEth.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/45 hidden sm:table-cell">
                    {(a.winRate * 100).toFixed(0)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
