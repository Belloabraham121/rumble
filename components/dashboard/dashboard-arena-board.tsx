"use client"

import type { ArenaAgentRow } from "@/components/dashboard/activity-types"
import { ExpandButton } from "@/components/dashboard/expandable-module"
import {
  formatSignedUsdInteger,
  formatSignedUsdcIntegerFromEthPnl,
} from "@/components/dashboard/pnl-usdc"
import { legacySimulatorEthPnlToUsd } from "@/lib/dashboard/legacy-simulator-pnl"

type Props = {
  agents: ArenaAgentRow[]
  currentAgentName?: string
  onExpand?: () => void
  variant?: "compact" | "lg"
  loading?: boolean
}

export function DashboardArenaBoard({
  agents,
  currentAgentName = "arena-alpha",
  onExpand,
  variant = "compact",
  loading = false,
}: Props) {
  const sorted = [...agents].sort((a, b) => b.score - a.score)
  const lg = variant === "lg"
  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-black/[0.07] bg-white/95 shadow-[0_8px_28px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-black/[0.06] bg-[#fafaf8]/90 flex items-center justify-between gap-2">
        <div>
          <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Arena</p>
          <p className="text-[10px] text-black/35 mt-0.5">
            Gladiator score · 30d · Mongo
          </p>
        </div>
        {onExpand && !lg && <ExpandButton onClick={onExpand} label="Expand arena" />}
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${loading ? "opacity-60" : ""}`}>
        <table className={`w-full text-left ${lg ? "text-[11px]" : "text-[10px]"}`}>
          <thead>
            <tr className="text-black/35 border-b border-black/[0.06]">
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Agent</th>
              {lg && <th className="px-2 py-1.5 font-medium hidden md:table-cell">Pool</th>}
              {lg && <th className="px-2 py-1.5 font-medium text-right hidden md:table-cell">Actions</th>}
              <th className="px-2 py-1.5 font-medium text-right">PnL (USDC)</th>
              <th className={`px-2 py-1.5 font-medium text-right ${lg ? "" : "hidden sm:table-cell"}`}>Win</th>
              {lg && <th className="px-2 py-1.5 font-medium text-right hidden md:table-cell">Score</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const you = a.name === currentAgentName
              const pnlUsdDisplay =
                a.pnlNetUsd !== undefined ? a.pnlNetUsd : legacySimulatorEthPnlToUsd(a.pnlEth)
              return (
                <tr
                  key={a.id}
                  className={`border-b border-black/[0.04] ${you ? "bg-emerald-50/80" : "hover:bg-black/[0.02]"}`}
                >
                  <td className="px-2 py-1.5 tabular-nums text-black/40">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-[#111] font-medium">{a.name}</span>
                    {you && <span className="ml-1 text-[8px] text-emerald-700 uppercase tracking-wide">you</span>}
                    {!lg && <div className="text-[9px] text-black/35 truncate max-w-[120px]">{a.pool}</div>}
                  </td>
                  {lg && <td className="px-2 py-1.5 text-black/55 hidden md:table-cell">{a.pool}</td>}
                  {lg && <td className="px-2 py-1.5 text-right tabular-nums text-black/60 hidden md:table-cell">{a.actions}</td>}
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      pnlUsdDisplay >= 0 ? "text-emerald-800/90" : "text-red-700/85"
                    }`}
                  >
                    {a.pnlNetUsd !== undefined
                      ? formatSignedUsdInteger(a.pnlNetUsd)
                      : formatSignedUsdcIntegerFromEthPnl(a.pnlEth)}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums text-black/45 ${lg ? "" : "hidden sm:table-cell"}`}>
                    {(a.winRate * 100).toFixed(0)}%
                  </td>
                  {lg && <td className="px-2 py-1.5 text-right tabular-nums text-black/70 hidden md:table-cell">{a.score}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
