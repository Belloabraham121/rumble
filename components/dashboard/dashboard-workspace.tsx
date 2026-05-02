"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AgentChartCanvas } from "@/components/dashboard/agent-chart-canvas"
import { AgentCapsulePanel, DEFAULT_BOXES } from "@/components/dashboard/agent-capsule-panel"
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed"
import { DashboardArenaBoard } from "@/components/dashboard/dashboard-arena-board"
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics"
import { DashboardReplayControls } from "@/components/dashboard/dashboard-replay-controls"
import { ExpandedModule } from "@/components/dashboard/expandable-module"
import { MOCK_ARENA_AGENTS } from "@/components/dashboard/mock-arena"
import { useAgent, useAgentsStore } from "@/lib/agents/agents-store"
import type { ArenaResolutionPayload } from "@/components/dashboard/activity-types"
import type { PriceBox } from "@/components/dashboard/types"
import type { AgentConfig } from "@/lib/agents/agent-types"

type Props = {
  agentId: string
}

export function DashboardWorkspace({ agentId }: Props) {
  const agent = useAgent(agentId)
  const { updateConfig, setStatus, recordResolution, ready } = useAgentsStore()

  const [, setBoxes] = useState<PriceBox[]>(DEFAULT_BOXES)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [livePrice, setLivePrice] = useState(2306.94)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)

  const [logExpanded, setLogExpanded] = useState(false)
  const [arenaExpanded, setArenaExpanded] = useState(false)

  const handleArenaResolution = useCallback(
    (p: ArenaResolutionPayload) => {
      if (!agentId) return
      recordResolution(agentId, p)
    },
    [agentId, recordResolution],
  )

  const handleConfigChange = useCallback(
    (patch: Partial<AgentConfig>) => {
      if (!agentId) return
      updateConfig(agentId, patch)
    },
    [agentId, updateConfig],
  )

  const activity = agent?.activity ?? []
  const totals = agent?.totals ?? { pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 }
  const agentStatus = agent?.status ?? "paused"
  const config = agent?.config
  const betAmount = agent?.config.betAmount ?? "0.10"

  const winRate = useMemo(() => {
    const d = totals.fills + totals.skips
    return d > 0 ? totals.fills / d : 0
  }, [totals.fills, totals.skips])

  const currentAgentName = config?.name ?? "arena-alpha"

  const arenaAgents = useMemo(() => {
    const scoreBump = Math.floor(totals.fills * 3 + totals.skips * 0.5)
    const alreadyInList = MOCK_ARENA_AGENTS.some(a => a.name === currentAgentName)
    const base = MOCK_ARENA_AGENTS.map(a =>
      a.name === currentAgentName
        ? {
            ...a,
            pnlEth: Number((a.pnlEth + totals.pnlEth * 0.42).toFixed(2)),
            score: a.score + scoreBump,
            winRate: totals.fills + totals.skips > 0 ? winRate : a.winRate,
            actions: a.actions + totals.fills + totals.skips,
          }
        : a,
    )
    if (alreadyInList) return base
    // Insert the current (newly-created) agent alongside the demo roster.
    return [
      ...base,
      {
        id: agentId,
        name: currentAgentName,
        pool: config?.pool ?? "ETH / USDC · 0.05%",
        pnlEth: Number(totals.pnlEth.toFixed(2)),
        winRate,
        actions: totals.fills + totals.skips,
        score: 450 + scoreBump,
      },
    ]
  }, [totals.pnlEth, totals.fills, totals.skips, winRate, currentAgentName, config?.pool, agentId])

  useEffect(() => {
    if (!replayPlaying || activity.length === 0) return
    const tick = window.setInterval(() => {
      setReplayIndex(i => {
        const cur = i ?? -1
        if (cur >= activity.length - 1) {
          setReplayPlaying(false)
          return activity.length - 1
        }
        return cur + 1
      })
    }, 850)
    return () => window.clearInterval(tick)
  }, [replayPlaying, activity.length])

  const highlightId =
    replayIndex !== null && replayIndex >= 0 && replayIndex < activity.length ? activity[replayIndex]?.id ?? null : null

  if (!ready) {
    return <div className="py-12 text-center text-[12px] text-black/40">Loading agent…</div>
  }

  if (!agent || !config) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-2xl border border-black/10 bg-white/80 px-6 py-8 text-center space-y-3">
        <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Agent not found</p>
        <p className="text-[12px] text-black/50">
          This agent may have been deleted from another window, or the link is invalid.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333]"
        >
          ← All agents
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-6rem)] gap-3">
      <div className="flex flex-1 min-h-0 gap-4">
        <aside
          className={`relative shrink-0 transition-[width,opacity] duration-300 ease-out ${
            sidebarOpen ? "w-[320px] xl:w-[340px] opacity-100" : "w-0 opacity-0 pointer-events-none"
          }`}
          aria-hidden={!sidebarOpen}
        >
          <div className="h-full min-w-[320px] xl:min-w-[340px] relative max-h-[calc(100vh-7rem)] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Hide sidebar"
              className="absolute -right-3 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)] text-black/55 hover:text-black transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <AgentCapsulePanel
              config={config}
              onConfigChange={handleConfigChange}
              agentStatus={agentStatus}
              onStatusChange={s => setStatus(agentId, s)}
              onApplyBoxes={setBoxes}
            />
          </div>
        </aside>

        <section className="flex flex-col flex-1 min-w-0 min-h-0 gap-3">
          <div className="relative flex-1 min-h-[min(52vh,520px)]">
            <AgentChartCanvas
              selectedTargetId={selectedTargetId}
              onSelectTarget={setSelectedTargetId}
              betAmount={betAmount}
              paused={agentStatus !== "running"}
              onPriceUpdate={setLivePrice}
              onArenaResolution={handleArenaResolution}
            />

            <div className="pointer-events-none absolute top-4 right-4 md:top-5 md:right-5 z-20">
              <div className="rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
                <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Live · ETH / USD</p>
                <p
                  className="mt-0.5 text-2xl leading-none tabular-nums text-[#111]"
                  style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
                >
                  ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show sidebar"
                className="absolute top-5 left-5 z-30 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] text-[11px] tracking-[0.18em] uppercase text-black/70 hover:text-black hover:bg-white transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className="font-pixel">Panel</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0 min-h-[220px] max-h-[340px] lg:max-h-[360px]">
            <div className="lg:col-span-5 min-h-[180px] lg:min-h-0">
              <DashboardActivityFeed
                events={activity}
                highlightId={highlightId}
                onExpand={() => setLogExpanded(true)}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-2 min-h-0">
              <DashboardMetrics
                pnlEth={totals.pnlEth}
                gasGweiTotal={totals.gasGwei}
                actions={totals.fills + totals.skips}
                winRate={winRate}
              />
              <DashboardReplayControls
                events={activity}
                replayIndex={replayIndex}
                replayPlaying={replayPlaying}
                onPlay={() => {
                  if (activity.length === 0) return
                  setReplayPlaying(true)
                  setReplayIndex(i => (i === null || i < 0 ? 0 : i))
                }}
                onPause={() => setReplayPlaying(false)}
                onStepPrev={() => {
                  setReplayPlaying(false)
                  setReplayIndex(i => {
                    const cur = i ?? 0
                    return Math.max(0, cur - 1)
                  })
                }}
                onStepNext={() => {
                  setReplayPlaying(false)
                  setReplayIndex(i => {
                    const cur = i ?? -1
                    return Math.min(activity.length - 1, cur + 1)
                  })
                }}
                onCloseReplay={() => {
                  setReplayPlaying(false)
                  setReplayIndex(null)
                }}
              />
            </div>
            <div className="lg:col-span-3 min-h-[180px] lg:min-h-0">
              <DashboardArenaBoard
                agents={arenaAgents}
                currentAgentName={currentAgentName}
                onExpand={() => setArenaExpanded(true)}
              />
            </div>
          </div>
        </section>
      </div>

      <ExpandedModule
        open={logExpanded}
        onClose={() => setLogExpanded(false)}
        title="Execution log"
        subtitle={`${activity.length} events · ${config.name}`}
      >
        <DashboardActivityFeed events={activity} highlightId={highlightId} variant="lg" />
      </ExpandedModule>

      <ExpandedModule
        open={arenaExpanded}
        onClose={() => setArenaExpanded(false)}
        title="Arena leaderboard"
        subtitle={`Ranked across ${arenaAgents.length} agents · ${config.pool}`}
      >
        <DashboardArenaBoard
          agents={arenaAgents}
          currentAgentName={currentAgentName}
          variant="lg"
        />
      </ExpandedModule>
    </div>
  )
}
