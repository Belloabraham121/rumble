"use client"

import type { AgentActivityEvent } from "@/components/dashboard/activity-types"

type Props = {
  events: AgentActivityEvent[]
  replayIndex: number | null
  replayPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onStepPrev: () => void
  onStepNext: () => void
  onCloseReplay: () => void
}

export function DashboardReplayControls({
  events,
  replayIndex,
  replayPlaying,
  onPlay,
  onPause,
  onStepPrev,
  onStepNext,
  onCloseReplay,
}: Props) {
  const total = events.length
  const idx = replayIndex ?? -1
  const label = idx >= 0 && idx < total ? `#${idx + 1} / ${total}` : total ? `0 / ${total}` : "—"

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white/95 px-3 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.04)] flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-pixel text-[8px] tracking-[0.18em] text-black/40 uppercase">Replay buffer</p>
        <p className="text-[10px] text-black/35 mt-0.5">Step through recent executions (dashboard mock).</p>
      </div>
      <span className="text-[10px] tabular-nums text-black/45 shrink-0">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onStepPrev}
          disabled={total === 0 || idx <= 0}
          className="rounded-lg border border-black/10 px-2 py-1 text-[10px] text-black/60 hover:bg-black/[0.03] disabled:opacity-40"
        >
          Prev
        </button>
        {replayPlaying ? (
          <button
            type="button"
            onClick={onPause}
            className="rounded-lg border border-black/12 bg-[#111] px-2.5 py-1 text-[10px] text-white hover:bg-[#333]"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            disabled={total === 0}
            className="rounded-lg border border-black/12 bg-[#111] px-2.5 py-1 text-[10px] text-white hover:bg-[#333] disabled:opacity-40"
          >
            Play
          </button>
        )}
        <button
          type="button"
          onClick={onStepNext}
          disabled={total === 0 || idx >= total - 1}
          className="rounded-lg border border-black/10 px-2 py-1 text-[10px] text-black/60 hover:bg-black/[0.03] disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={onCloseReplay}
          className="rounded-lg border border-black/10 px-2 py-1 text-[10px] text-black/45 hover:bg-black/[0.03]"
        >
          Clear highlight
        </button>
      </div>
    </div>
  )
}
