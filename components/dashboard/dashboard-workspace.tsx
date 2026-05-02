"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AgentChartCanvas } from "@/components/dashboard/agent-chart-canvas"
import { AgentCapsulePanel, DEFAULT_BOXES } from "@/components/dashboard/agent-capsule-panel"
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed"
import { DashboardArenaBoard } from "@/components/dashboard/dashboard-arena-board"
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics"
import { DashboardReplayControls } from "@/components/dashboard/dashboard-replay-controls"
import { MOCK_ARENA_AGENTS } from "@/components/dashboard/mock-arena"
import { buildActivityFromHit } from "@/components/dashboard/synthesize-activity"
import type { AgentActivityEvent, ArenaResolutionPayload } from "@/components/dashboard/activity-types"
import type { PriceBox } from "@/components/dashboard/types"

const CURRENT_AGENT = "arena-alpha"
const MAX_EVENTS = 100

export function DashboardWorkspace() {
  const [, setBoxes] = useState<PriceBox[]>(DEFAULT_BOXES)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<"idle" | "armed" | "running">("running")
  const [livePrice, setLivePrice] = useState(2306.94)
  const [betAmount, setBetAmount] = useState("0.10")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [activity, setActivity] = useState<AgentActivityEvent[]>([])
  const [totals, setTotals] = useState({ pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 })

  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)

  const missSkipRef = useRef(0)

  const handleArenaResolution = useCallback((p: ArenaResolutionPayload) => {
    if (!p.hit) {
      missSkipRef.current += 1
      if (missSkipRef.current % 6 !== 0) return
    } else {
      missSkipRef.current = 0
    }

    const ev = buildActivityFromHit({ hit: p.hit, mult: p.mult, payoutEth: p.payoutEth })
    setActivity(prev => [...prev.slice(-(MAX_EVENTS - 1)), ev])
    setTotals(t => {
      const g = ev.gasGwei ?? 0
      if (ev.kind === "box_skipped") {
        return { ...t, skips: t.skips + 1, gasGwei: t.gasGwei + g }
      }
      return {
        ...t,
        fills: t.fills + 1,
        pnlEth: t.pnlEth + (ev.pnlEth ?? 0),
        gasGwei: t.gasGwei + g,
      }
    })
  }, [])

  const winRate = useMemo(() => {
    const d = totals.fills + totals.skips
    return d > 0 ? totals.fills / d : 0
  }, [totals.fills, totals.skips])

  const arenaAgents = useMemo(() => {
    const scoreBump = Math.floor(totals.fills * 3 + totals.skips * 0.5)
    return MOCK_ARENA_AGENTS.map(a =>
      a.name === CURRENT_AGENT
        ? {
            ...a,
            pnlEth: Number((a.pnlEth + totals.pnlEth * 0.42).toFixed(2)),
            score: a.score + scoreBump,
            winRate: totals.fills + totals.skips > 0 ? winRate : a.winRate,
            actions: a.actions + totals.fills + totals.skips,
          }
        : a,
    )
  }, [totals.pnlEth, totals.fills, totals.skips, winRate])

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
              agentStatus={agentStatus}
              onStatusChange={setAgentStatus}
              onApplyBoxes={setBoxes}
              betAmount={betAmount}
              onBetAmountChange={setBetAmount}
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
              <DashboardActivityFeed events={activity} highlightId={highlightId} />
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
              <DashboardArenaBoard agents={arenaAgents} currentAgentName={CURRENT_AGENT} />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
