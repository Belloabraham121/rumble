"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AgentCard } from "@/components/dashboard/agent-card"
import { CreateAgentModal } from "@/components/dashboard/create-agent-modal"
import { OverviewMetrics } from "@/components/dashboard/overview-metrics"
import { useAgentsStore } from "@/lib/agents/agents-store"
import type { AgentConfig, AgentStatus } from "@/lib/agents/agent-types"

export function AgentsOverview() {
  const router = useRouter()
  const { agents, ready, createAgent, removeAgent, setStatus } = useAgentsStore()
  const [creatingOpen, setCreatingOpen] = useState(false)

  const sortedAgents = useMemo(() => [...agents].sort((a, b) => b.createdAt - a.createdAt), [agents])
  const existingNames = useMemo(() => agents.map(a => a.config.name), [agents])

  function handleCreate(cfg: AgentConfig) {
    const next = createAgent(cfg)
    setCreatingOpen(false)
    router.push(`/dashboard/agents/${next.id}`)
  }

  function handlePauseToggle(id: string, status: AgentStatus) {
    setStatus(id, status)
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 sm:justify-between">
        <div>
          <p className="font-pixel text-[10px] tracking-[0.22em] text-black/40 uppercase">Dashboard</p>
          <h1
            className="mt-1 text-3xl md:text-4xl font-light tracking-tight text-[#111]"
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            Your agents
          </h1>
          <p className="mt-1 text-[12px] text-black/45">
            Every agent runs autonomously — walk away, come back, keep winning.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333] transition-colors self-start sm:self-auto"
        >
          + Create agent
        </button>
      </div>

      <OverviewMetrics agents={sortedAgents} />

      {!ready ? (
        <div className="py-12 text-center text-[12px] text-black/40">Loading agents…</div>
      ) : sortedAgents.length === 0 ? (
        <EmptyState onCreate={() => setCreatingOpen(true)} />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {sortedAgents.map(a => (
            <AgentCard key={a.id} agent={a} onPauseToggle={handlePauseToggle} onRemove={removeAgent} />
          ))}
        </section>
      )}

      <CreateAgentModal
        open={creatingOpen}
        onClose={() => setCreatingOpen(false)}
        onCreate={handleCreate}
        existingNames={existingNames}
      />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/15 bg-white/60 px-6 py-16 text-center space-y-3">
      <p className="font-pixel text-[10px] tracking-[0.22em] text-black/40 uppercase">No agents yet</p>
      <h2
        className="text-xl md:text-2xl font-light text-[#111]"
        style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
      >
        Launch your first gladiator
      </h2>
      <p className="text-[12px] text-black/45 max-w-md mx-auto">
        Configure a goal and a pool. Your agent starts ticking immediately and keeps running until you pause it.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333] transition-colors"
      >
        Create your first agent
      </button>
    </div>
  )
}
