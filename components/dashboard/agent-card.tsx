"use client"

import Link from "next/link"
import { useState } from "react"
import { DeleteAgentModal } from "@/components/dashboard/delete-agent-modal"
import { formatPnlUsdc } from "@/components/dashboard/pnl-usdc"
import type { Agent, AgentStatus } from "@/lib/agents/agent-types"

function statusDot(status: AgentStatus): string {
  return status === "running" ? "bg-emerald-500" : "bg-amber-500"
}

function statusLabel(status: AgentStatus): string {
  return status === "running" ? "Running" : "Paused"
}

function timeAgo(ts: number): string {
  const diffS = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (diffS < 60) return `${diffS}s ago`
  const m = Math.round(diffS / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

type Props = {
  agent: Agent
  onPauseToggle: (id: string, next: AgentStatus) => void
  onRemove: (id: string) => void
}

export function AgentCard({ agent, onPauseToggle, onRemove }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const lastEvent = agent.activity[agent.activity.length - 1]
  const actions = agent.totals.fills + agent.totals.skips
  const winRate = actions > 0 ? agent.totals.fills / actions : 0
  const pnl = agent.totals.pnlEth

  return (
    <>
    <div className="relative rounded-2xl border border-black/[0.08] bg-white/92 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.06)] flex flex-col gap-3 hover:shadow-[0_18px_48px_rgba(0,0,0,0.08)] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full ${statusDot(agent.status)} shrink-0`} />
            <p className="font-pixel text-[9px] tracking-[0.18em] text-black/45 uppercase">{statusLabel(agent.status)}</p>
          </div>
          <h3
            className="mt-1 text-base font-medium text-[#111] truncate"
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            {agent.config.name}
          </h3>
          <p className="text-[10px] text-black/40 truncate mt-0.5">{agent.config.pool}</p>
        </div>
        <Link
          href={`/dashboard/agents/${agent.id}`}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#111] text-white text-[10px] tracking-wider hover:bg-[#333] transition-colors"
        >
          Open →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-black/[0.06] bg-[#fafaf8]/90 px-2.5 py-2">
          <p className="text-[8px] tracking-widest text-black/35 uppercase">PnL</p>
          <p
            className={`text-sm tabular-nums font-medium ${pnl >= 0 ? "text-emerald-700" : "text-red-700"}`}
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            {formatPnlUsdc(pnl)}
          </p>
        </div>
        <div className="rounded-lg border border-black/[0.06] bg-[#fafaf8]/90 px-2.5 py-2">
          <p className="text-[8px] tracking-widest text-black/35 uppercase">Actions</p>
          <p className="text-sm tabular-nums text-[#111] font-medium">{actions}</p>
        </div>
        <div className="rounded-lg border border-black/[0.06] bg-[#fafaf8]/90 px-2.5 py-2">
          <p className="text-[8px] tracking-widest text-black/35 uppercase">Win</p>
          <p className="text-sm tabular-nums text-[#111] font-medium">{(winRate * 100).toFixed(0)}%</p>
        </div>
      </div>

      <div className="text-[10px] text-black/45 leading-snug line-clamp-2" title={agent.config.goal}>
        {agent.config.goal}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-black/40 border-t border-black/[0.05] pt-2.5">
        <span className="truncate">
          {lastEvent ? `Last: ${lastEvent.title} · ${timeAgo(lastEvent.at)}` : "Waiting for first action…"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onPauseToggle(agent.id, agent.status === "running" ? "paused" : "running")}
            className="px-2 py-1 rounded-md border border-black/10 hover:bg-black/[0.03] tracking-wide"
          >
            {agent.status === "running" ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="px-2 py-1 rounded-md border border-black/10 text-black/40 hover:text-red-700 hover:border-red-300 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <DeleteAgentModal
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      agent={agent}
      onConfirmDelete={id => onRemove(id)}
    />
    </>
  )
}
