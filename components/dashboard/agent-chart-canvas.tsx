"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { PriceBox } from "@/components/dashboard/types"
import { multiplierForCell } from "@/components/dashboard/grid-multipliers"
import { chartTheme as T } from "@/components/dashboard/chart-theme"

type Props = {
  boxes: PriceBox[]
  selectedBoxId: string | null
  onSelectBox: (id: string | null) => void
  paused?: boolean
}

const W = 780
const H = 380
const PAD = { l: 44, r: 14, t: 52, b: 22 }
const GRID_ROWS = 8
const GRID_COLS = 6

function gridLeftPx() {
  return Math.round(W * 0.34)
}

function priceToY(price: number, minP: number, maxP: number) {
  const n = (price - minP) / (maxP - minP)
  return PAD.t + (1 - n) * (H - PAD.t - PAD.b)
}

function usdFromSim(p: number) {
  return 2306.94 + (p - 54) * 14.2
}

function rowForPrice(p: number, minP: number, maxP: number) {
  if (maxP <= minP) return 0
  const n = (maxP - p) / (maxP - minP)
  return Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(n * GRID_ROWS)))
}

export function AgentChartCanvas({ boxes, selectedBoxId, onSelectBox, paused = false }: Props) {
  const gl = gridLeftPx()
  const chartRight = gl - 8
  const gridTop = PAD.t
  const gridBottom = H - PAD.b
  const cellH = (gridBottom - gridTop) / GRID_ROWS
  const cellW = (W - PAD.r - gl) / GRID_COLS

  const headX = PAD.l + (chartRight - PAD.l) * 0.92

  const [history, setHistory] = useState<{ x: number; p: number }[]>(() =>
    Array.from({ length: 90 }, (_, i) => ({ x: i, p: 52 + Math.sin(i * 0.11) * 8 })),
  )
  const [currentP, setCurrentP] = useState(56)
  const [hitFlash, setHitFlash] = useState<{ label: string; at: number } | null>(null)

  const prevGridKeyRef = useRef<string | null>(null)
  const prevBandIdRef = useRef<string | null>(null)
  const rafRef = useRef(0)
  const tRef = useRef(0)

  const { minP, maxP } = useMemo(() => {
    let lo = Math.min(...boxes.map(b => b.low), currentP)
    let hi = Math.max(...boxes.map(b => b.high), currentP)
    const pad = (hi - lo) * 0.12 || 2
    return { minP: lo - pad, maxP: hi + pad }
  }, [boxes, currentP])

  const dimsRef = useRef({ minP, maxP, gl, cellW, cellH, gridTop, gridBottom, headX })
  dimsRef.current = { minP, maxP, gl, cellW, cellH, gridTop, gridBottom, headX }

  const headY = priceToY(currentP, minP, maxP)
  const activeRow = rowForPrice(currentP, minP, maxP)
  const activeCol = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((headX - gl) / cellW)))

  const pathD = useMemo(() => {
    if (history.length < 2) return ""
    const innerEnd = headX
    const maxX = Math.max(...history.map(h => h.x), 1)
    return history
      .map((pt, i) => {
        const x = PAD.l + (pt.x / maxX) * (innerEnd - PAD.l)
        const y = priceToY(pt.p, minP, maxP)
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(" ")
  }, [history, minP, maxP, headX])

  useEffect(() => {
    if (paused) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const loop = () => {
      tRef.current += 1
      const t = tRef.current * 0.018
      const noise = (Math.random() - 0.5) * 0.45
      const next = 54 + Math.sin(t) * 10 + Math.cos(t * 0.7) * 4 + noise

      let lo = Math.min(...boxes.map(b => b.low), next)
      let hi = Math.max(...boxes.map(b => b.high), next)
      const pad = (hi - lo) * 0.12 || 2
      lo -= pad
      hi += pad

      const row = rowForPrice(next, lo, hi)
      const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((dimsRef.current.headX - dimsRef.current.gl) / dimsRef.current.cellW)))
      const gridKey = `${row}-${col}`

      if (prevGridKeyRef.current !== null && prevGridKeyRef.current !== gridKey) {
        const mult = multiplierForCell(row, col, GRID_ROWS, GRID_COLS)
        setHitFlash({ label: `${mult} · box`, at: Date.now() })
      }
      prevGridKeyRef.current = gridKey

      let bandId: string | null = null
      for (const b of boxes) {
        if (next >= b.low && next <= b.high) bandId = b.id
      }
      if (bandId && prevBandIdRef.current !== bandId) {
        const box = boxes.find(b => b.id === bandId)
        if (box) setHitFlash({ label: box.hitLabel, at: Date.now() })
      }
      prevBandIdRef.current = bandId

      setCurrentP(next)
      setHistory(h => {
        const lastX = h[h.length - 1]?.x ?? 0
        return [...h, { x: lastX + 1, p: next }].slice(-160)
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    prevGridKeyRef.current = null
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, boxes])

  useEffect(() => {
    if (!hitFlash) return
    const tid = window.setTimeout(() => setHitFlash(null), 1800)
    return () => window.clearTimeout(tid)
  }, [hitFlash])

  const usd = usdFromSim(currentP)

  return (
    <div className="relative w-full rounded-2xl border border-black/[0.07] bg-white shadow-[0_28px_70px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="absolute top-3 left-4 z-20 flex flex-col gap-0.5">
        <span className="font-pixel text-[9px] tracking-[0.18em]" style={{ color: T.muted }}>
          ETH / USD · LIVE
        </span>
        <span
          className="text-2xl md:text-3xl font-light tabular-nums tracking-tight"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif', color: T.ink }}
        >
          ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto min-h-[300px] md:min-h-[360px] touch-none select-none block"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="cellGlowLight" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.accentSoft} />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
        </defs>

        <rect width={W} height={H} fill={T.canvas} />

        {[0, 0.33, 0.66, 1].map(g => {
          const x = PAD.l + g * (gl - PAD.l - 24)
          return (
            <line key={`v-${g}`} x1={x} y1={PAD.t} x2={x} y2={H - PAD.b} stroke={T.grid} strokeWidth="1" />
          )
        })}

        {[0, 0.25, 0.5, 0.75, 1].map(g => {
          const y = PAD.t + g * (H - PAD.t - PAD.b)
          return (
            <line key={`h-${g}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={T.gridStrong} strokeWidth="1" />
          )
        })}

        <line x1={gl} y1={PAD.t} x2={gl} y2={H - PAD.b} stroke={T.divider} strokeWidth="1" />

        {boxes.map(b => {
          const y1 = priceToY(b.high, minP, maxP)
          const y2 = priceToY(b.low, minP, maxP)
          const top = Math.min(y1, y2)
          const h = Math.abs(y2 - y1)
          const isSel = selectedBoxId === b.id
          return (
            <rect
              key={b.id}
              x={PAD.l}
              y={top}
              width={gl - PAD.l - 4}
              height={Math.max(h, 3)}
              fill={isSel ? `${b.color}35` : `${b.color}18`}
              stroke={isSel ? T.bandStrokeSelected : T.bandStroke}
              strokeWidth={isSel ? 1.5 : 1}
              className="cursor-pointer"
              onClick={e => {
                e.stopPropagation()
                onSelectBox(isSel ? null : b.id)
              }}
            />
          )
        })}

        {Array.from({ length: GRID_ROWS }, (_, r) =>
          Array.from({ length: GRID_COLS }, (_, c) => {
            const x = gl + c * cellW
            const y = gridTop + r * cellH
            const mult = multiplierForCell(r, c, GRID_ROWS, GRID_COLS)
            const isActive = r === activeRow && c === activeCol
            const isSelected = selectedBoxId === `grid-${r}-${c}`
            const highlight = isActive || isSelected
            return (
              <g key={`${r}-${c}`}>
                <rect
                  x={x + 1}
                  y={y + 1}
                  width={cellW - 2}
                  height={cellH - 2}
                  rx={3}
                  fill={highlight ? T.cellActiveFill : T.cellIdle}
                  stroke={highlight ? T.cellActiveStroke : T.cellIdleStroke}
                  strokeWidth={highlight ? 1.5 : 1}
                  style={{ filter: highlight ? "url(#cellGlowLight)" : undefined }}
                  className="cursor-pointer"
                  onClick={e => {
                    e.stopPropagation()
                    onSelectBox(isSelected ? null : `grid-${r}-${c}`)
                  }}
                />
                <text
                  x={x + cellW / 2}
                  y={y + cellH / 2 + 3}
                  textAnchor="middle"
                  fill={highlight ? T.cellTextActive : T.cellText}
                  style={{ fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: highlight ? 600 : 500 }}
                >
                  {mult}
                </text>
              </g>
            )
          }),
        )}

        {pathD && (
          <path d={`${pathD} L ${headX} ${H - PAD.b} L ${PAD.l} ${H - PAD.b} Z`} fill="url(#areaFill)" />
        )}

        <path
          d={pathD}
          fill="none"
          stroke={T.accentBright}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#lineGlow)"
          opacity={0.95}
        />

        <circle cx={headX} cy={headY} r={6} fill={T.surface} stroke={T.accent} strokeWidth="2.5" />
        <line
          x1={headX}
          y1={headY}
          x2={headX}
          y2={H - PAD.b}
          stroke={T.accentGlow}
          strokeWidth="1"
          strokeDasharray="5 5"
        />

        {[0, 0.5, 1].map(g => {
          const y = PAD.t + g * (H - PAD.t - PAD.b)
          const val = minP + (1 - g) * (maxP - minP)
          return (
            <text key={g} x={10} y={y + 4} fill={T.mutedLight} style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}>
              {val.toFixed(0)}
            </text>
          )
        })}
      </svg>

      {hitFlash && (
        <div className="absolute left-1/2 top-[42%] z-30 -translate-x-1/2 pointer-events-none" key={hitFlash.at}>
          <div className="rounded-xl border border-emerald-600/25 bg-emerald-50/95 px-4 py-2.5 text-center shadow-lg backdrop-blur-sm dashboard-hit-pop">
            <p className="text-[10px] tracking-[0.18em] text-emerald-800/90 uppercase">Triggered</p>
            <p className="mt-0.5 text-sm font-light text-emerald-950 tabular-nums" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
              {hitFlash.label}
            </p>
          </div>
        </div>
      )}

      <p className="px-4 py-2 text-[10px] text-black/35 border-t border-black/[0.06] bg-[#fafaf8]/95">
        Emerald trace matches site accents · Multiplier grid · Left bands = ranges from the capsule.
      </p>
    </div>
  )
}
