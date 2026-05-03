"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { AgentActivityEvent, ExecutionKind } from "@/components/dashboard/activity-types"
import { ExpandButton } from "@/components/dashboard/expandable-module"
import { formatPnlUsdc } from "@/components/dashboard/pnl-usdc"

function kindLabel(kind: ExecutionKind): string {
  switch (kind) {
    case "swap":
      return "SWAP"
    case "add_liquidity":
      return "LP+"
    case "remove_liquidity":
      return "LP−"
    case "claim_fees":
      return "FEES"
    case "close_position":
      return "CLOSE"
    case "box_skipped":
      return "SKIP"
    case "error":
      return "ERR"
    default:
      return "EVT"
  }
}

function kindTone(kind: ExecutionKind): string {
  switch (kind) {
    case "box_skipped":
      return "bg-black/[0.06] text-black/45 border-black/10"
    case "error":
      return "bg-red-50 text-red-900/90 border-red-200/60"
    case "close_position":
      return "bg-amber-50 text-amber-900/90 border-amber-200/60"
    default:
      return "bg-emerald-50 text-emerald-900/90 border-emerald-200/50"
  }
}

type Props = {
  events: AgentActivityEvent[]
  highlightId: string | null
  onExpand?: () => void
  /** Compact is the inline module variant; lg is for the modal view. */
  variant?: "compact" | "lg"
  /** Agent is running — show Live badge and tail polling. */
  live?: boolean
}

/** Pixels from bottom to still count as "following" the live tail. */
const STICK_THRESHOLD_PX = 72

export function DashboardActivityFeed({
  events,
  highlightId,
  onExpand,
  variant = "compact",
  live = false,
}: Props) {
  const lg = variant === "lg"
  const listRef = useRef<HTMLUListElement>(null)
  /** True while the user is pinned near the bottom; false after they scroll up to read history. */
  const stickToBottomRef = useRef(true)
  const [isFollowing, setIsFollowing] = useState(true)

  function updateStickFromScroll() {
    const el = listRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const next = distanceFromBottom <= STICK_THRESHOLD_PX
    stickToBottomRef.current = next
    setIsFollowing(prev => (prev === next ? prev : next))
  }

  // Scroll the list container directly (NOT scrollIntoView, which would scroll
  // every ancestor — including the page — and trap the user at the bottom).
  useLayoutEffect(() => {
    if (highlightId) return
    if (!stickToBottomRef.current) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [events.length, highlightId])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    updateStickFromScroll()
    el.addEventListener("scroll", updateStickFromScroll, { passive: true })
    return () => el.removeEventListener("scroll", updateStickFromScroll)
  }, [])

  function jumpToLatest() {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    stickToBottomRef.current = true
    setIsFollowing(true)
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-2xl border border-black/[0.07] bg-[#fafaf8]/95 shadow-[0_8px_28px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-black/[0.06] bg-white/80 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Execution log</p>
            {live && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5"
                title="Agent is running — log refreshes in real time"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-pixel text-[7px] tracking-[0.18em] text-emerald-800 uppercase">
                  Live
                </span>
              </span>
            )}
          </div>
          <p className="text-[10px] text-black/35 mt-0.5">Swaps · liquidity · claims · misses</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isFollowing && events.length > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="rounded-full border border-emerald-600/25 bg-emerald-50 px-2.5 py-1 text-[9px] tracking-wider uppercase text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              ↓ Latest
            </button>
          )}
          {onExpand && !lg && <ExpandButton onClick={onExpand} label="Expand execution log" />}
        </div>
      </div>
      <ul
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2 space-y-1.5"
      >
        {events.length === 0 && (
          <li className="px-2 py-6 text-center text-[11px] text-black/35">
            Execution rows appear when the server-side agent tick runs (live arena data).
          </li>
        )}
        {events.map(ev => {
          const hi = highlightId === ev.id
          return (
            <li
              key={ev.id}
              className={`rounded-xl ${lg ? "px-3 py-2.5" : "px-2.5 py-2"} text-left transition-colors ${
                hi ? "bg-emerald-100/90 ring-1 ring-emerald-400/40" : "bg-white/70 hover:bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 ${lg ? "text-[9px]" : "text-[8px]"} font-semibold tracking-wide border ${kindTone(ev.kind)}`}
                >
                  {kindLabel(ev.kind)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`${lg ? "text-[12px]" : "text-[11px]"} font-medium text-[#111] leading-snug`}>{ev.title}</p>
                  <p className={`${lg ? "text-[11px]" : "text-[10px]"} text-black/45 leading-snug mt-0.5`}>{ev.detail}</p>
                  <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ${lg ? "text-[10px]" : "text-[9px]"} text-black/35 tabular-nums`}>
                    <span>{new Date(ev.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    {ev.pnlEth != null && (
                      <span className={ev.pnlEth >= 0 ? "text-emerald-700/90" : "text-red-700/80"}>Δ {formatPnlUsdc(ev.pnlEth)}</span>
                    )}
                    {ev.gasGwei != null && <span>{ev.gasGwei} gwei</span>}
                    {ev.txShort && <span className="font-mono">{ev.txShort}</span>}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
