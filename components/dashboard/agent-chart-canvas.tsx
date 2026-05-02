"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { ArenaResolutionPayload } from "@/components/dashboard/activity-types"
import { chartTheme as T } from "@/components/dashboard/chart-theme"
import { getPoolChartSim } from "@/lib/agents/arena-pools"

type Props = {
  selectedTargetId: string | null
  onSelectTarget: (id: string | null) => void
  betAmount: string
  paused?: boolean
  /** Canonical arena pool — drives sim Price path + quote (`mechanics.md`). */
  poolId?: string
  onPriceUpdate?: (usdPrice: number) => void
  /** Fires once per box when it resolves at the head (hit or miss). */
  onArenaResolution?: (payload: ArenaResolutionPayload) => void
  /**
   * Live USD price from `/api/data/pools/[id]/price`. When set, the chart drives the
   * head + trail from this value instead of the internal sim (`agent.md` §chart).
   */
  liveUsdPrice?: number | null
  /** Optional seed prices (most recent USD closes) used to prime the trail on pool change. */
  liveSeedUsdPrices?: number[]
}

const W = 1600
const H = 900
const PAD = { l: 52, r: 20, t: 32, b: 32 }
const GRID_ROWS = 12
const GRID_COLS = 16
/** Head (arrow) sits near the LEFT of the board. Trail renders behind it. */
const HEAD_COL = 3
/** How fast target boxes scroll leftward, in cells-per-frame. */
const BOX_SPEED = 0.018
/** Spawn one full column of boxes every `SPAWN_GAP` cells so the grid stays filled. */
const SPAWN_GAP = 1

type TargetBox = {
  id: string
  row: number
  /**
   * Integer lattice index. Effective rendered column = `lattice - scroll`.
   * Keeping this as an integer means every box shares the same fractional
   * scroll offset and they can never overlap each other.
   */
  lattice: number
  mult: number
  resolved: boolean
  hit: boolean
}

function priceToY(price: number, minP: number, maxP: number) {
  const n = (price - minP) / (maxP - minP)
  return PAD.t + (1 - n) * (H - PAD.t - PAD.b)
}

function rowForPrice(p: number, minP: number, maxP: number) {
  if (maxP <= minP) return 0
  const n = (maxP - p) / (maxP - minP)
  return Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(n * GRID_ROWS)))
}

function pickMultiplier(row: number) {
  // Edges pay more; middle rows pay less. Small random jitter per box.
  const center = (GRID_ROWS - 1) / 2
  const d = Math.abs(row - center) / center
  const base = 1.1 + d * 3.2
  const jitter = 0.92 + Math.random() * 0.26
  return Math.round(base * jitter * 100) / 100
}

/**
 * Deterministic (seed-driven) multiplier for the initial grid. Using
 * Math.random() in the initial useState would cause a hydration mismatch
 * between SSR and client render, so the startup waves get a stable hash
 * and scrolled-in boxes keep using the random jitter variant above.
 */
function seededMultiplier(row: number, seed: number) {
  const center = (GRID_ROWS - 1) / 2
  const d = Math.abs(row - center) / center
  const base = 1.1 + d * 3.2
  const hashed = (seed * 9301 + 49297) % 233280
  const jitter = 0.92 + (hashed / 233280) * 0.26
  return Math.round(base * jitter * 100) / 100
}

export function AgentChartCanvas({
  selectedTargetId,
  onSelectTarget,
  betAmount,
  paused = false,
  poolId = "eth-usdc",
  onPriceUpdate,
  onArenaResolution,
  liveUsdPrice = null,
  liveSeedUsdPrices,
}: Props) {
  const uid = useId().replace(/:/g, "")
  const lineGlowId = `${uid}-lineGlow`
  const cellGlowLightId = `${uid}-cellGlowLight`
  const areaFillId = `${uid}-areaFill`
  const trailFadeId = `${uid}-trailFade`

  const poolSim = useMemo(() => getPoolChartSim(poolId), [poolId])

  const gl = PAD.l
  const chartRight = W - PAD.r
  const gridTop = PAD.t
  const gridBottom = H - PAD.b
  const cellH = (gridBottom - gridTop) / GRID_ROWS
  const cellW = (chartRight - gl) / GRID_COLS

  const headX = gl + HEAD_COL * cellW + cellW / 2

  const [history, setHistory] = useState<{ x: number; p: number }[]>(() =>
    Array.from({ length: 56 }, (_, i) => ({ x: i, p: 52 + Math.sin(i * 0.18) * 8 })),
  )
  const [currentP, setCurrentP] = useState(56)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [targets, setTargets] = useState<TargetBox[]>(() => {
    const init: TargetBox[] = []
    for (let lattice = HEAD_COL + 1; lattice <= GRID_COLS; lattice++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        init.push({
          id: `t-init-${lattice}-${row}`,
          row,
          lattice,
          mult: seededMultiplier(row, lattice * 37 + row),
          resolved: false,
          hit: false,
        })
      }
    }
    return init
  })
  const [hitFlash, setHitFlash] = useState<{ label: string; at: number } | null>(null)

  const rafRef = useRef(0)
  const tRef = useRef(0)
  const scrollRef = useRef(0)
  const nextLatticeRef = useRef(GRID_COLS + 1)
  const idRef = useRef(1000)

  const liveMode = liveUsdPrice != null

  const { minP, maxP } = useMemo(() => {
    if (!liveMode) return { minP: 38, maxP: 68 }
    const prices: number[] = history.map((h) => h.p)
    if (liveUsdPrice != null) prices.push(liveUsdPrice)
    if (prices.length === 0) return { minP: 38, maxP: 68 }
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const span = Math.max(hi - lo, Math.abs(hi) * 0.005 || 1)
    const pad = span * 0.25
    return { minP: lo - pad, maxP: hi + pad }
  }, [liveMode, history, liveUsdPrice])

  const headY = priceToY(currentP, minP, maxP)
  const activeRow = rowForPrice(currentP, minP, maxP)

  const parsedBet = Number.parseFloat(betAmount)
  const safeBet = Number.isFinite(parsedBet) && parsedBet > 0 ? parsedBet : 0

  const seenResolvedRef = useRef(new Set<string>())

  /** Share latest values with the RAF loop without retriggering it on every tick. */
  const liveUsdPriceRef = useRef<number | null>(liveUsdPrice)
  const priceRangeRef = useRef({ minP, maxP })
  useEffect(() => {
    liveUsdPriceRef.current = liveUsdPrice
  }, [liveUsdPrice])
  useEffect(() => {
    priceRangeRef.current = { minP, maxP }
  }, [minP, maxP])

  /**
   * Trail: map the last history points linearly across the area to the LEFT
   * of the head (x = gl .. headX). The line flows up/down, landing on the head.
   */
  const pathD = useMemo(() => {
    if (history.length < 2) return ""
    const trail = history.slice(-48)
    const n = trail.length
    return trail
      .map((pt, i) => {
        const xNorm = i / (n - 1 || 1)
        const x = gl + xNorm * (headX - gl)
        const row = rowForPrice(pt.p, minP, maxP)
        const y = gridTop + row * cellH + cellH / 2
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(" ")
  }, [history, minP, maxP, gl, headX, gridTop, cellH])

  /** Seed history from real candles when provided. */
  useEffect(() => {
    if (!liveSeedUsdPrices || liveSeedUsdPrices.length === 0) return
    const seeded = liveSeedUsdPrices.slice(-120).map((p, i) => ({ x: i, p }))
    setHistory(seeded)
    const last = seeded[seeded.length - 1]
    if (last) setCurrentP(last.p)
  }, [liveSeedUsdPrices])

  useEffect(() => {
    if (paused) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const loop = () => {
      tRef.current += 1
      const live = liveUsdPriceRef.current
      const { minP: liveMinP, maxP: liveMaxP } = priceRangeRef.current

      let next: number
      let reportedUsd: number
      if (live != null) {
        next = live
        reportedUsd = live
      } else {
        const t = tRef.current * 0.02
        const noise = (Math.random() - 0.5) * 0.5
        next =
          poolSim.mid +
          Math.sin(t + poolSim.phase) * poolSim.amp +
          Math.cos(t * 0.73 + poolSim.phase * 0.5) * (poolSim.amp * 0.42) +
          noise
        reportedUsd = poolSim.usdFromSim(next)
      }

      const nextRow = rowForPrice(next, liveMinP, liveMaxP)

      setCurrentP(next)
      onPriceUpdate?.(reportedUsd)
      setHistory(h => {
        const lastX = h[h.length - 1]?.x ?? 0
        return [...h, { x: lastX + 1, p: next }].slice(-120)
      })

      // Advance global scroll. All boxes share the same fractional offset,
      // so they always tile perfectly into integer-wide cells.
      scrollRef.current += BOX_SPEED
      const scroll = scrollRef.current
      setScrollOffset(scroll)

      // --- Compute new waves imperatively (outside the state updater). ---
      // React 18 StrictMode invokes state updaters twice in dev to surface
      // impurity, so we MUST NOT mutate refs (`nextLatticeRef`, `idRef`) or
      // fire other setters from inside `setTargets(prev => ...)`. Doing so
      // caused `nextLatticeRef` to race ahead of actual spawns and spawning
      // would visibly stall for seconds at a time.
      const newBoxes: TargetBox[] = []
      while (nextLatticeRef.current - scroll <= GRID_COLS + 2) {
        const lattice = nextLatticeRef.current
        for (let row = 0; row < GRID_ROWS; row++) {
          idRef.current += 1
          newBoxes.push({
            id: `t-${idRef.current}`,
            row,
            lattice,
            mult: pickMultiplier(row),
            resolved: false,
            hit: false,
          })
        }
        nextLatticeRef.current += SPAWN_GAP
      }

      // Pure updater: derives new array from `prev` and the captured
      // `scroll` / `newBoxes` / `nextRow` closures only. Safe to run twice.
      let flashed: { label: string; at: number } | null = null
      setTargets(prev => {
        const moved: TargetBox[] = []
        for (const b of prev) {
          const effectiveCol = b.lattice - scroll
          let resolved = b.resolved
          let hit = b.hit
          if (!resolved && effectiveCol <= HEAD_COL) {
            resolved = true
            hit = b.row === nextRow
            if (hit) {
              const payout = safeBet > 0 ? (safeBet * b.mult).toFixed(4) : "0.0000"
              flashed = {
                label: `+${payout} ETH · x${b.mult.toFixed(2)}`,
                at: Date.now(),
              }
            }
          }
          if (effectiveCol < -0.8) continue
          moved.push({ ...b, resolved, hit })
        }
        if (newBoxes.length > 0) moved.push(...newBoxes)
        return moved
      })
      if (flashed) setHitFlash(flashed)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, onPriceUpdate, safeBet, poolSim])

  useEffect(() => {
    if (!hitFlash) return
    const tid = window.setTimeout(() => setHitFlash(null), 1800)
    return () => window.clearTimeout(tid)
  }, [hitFlash])

  useEffect(() => {
    if (!selectedTargetId) return
    if (!targets.some(b => b.id === selectedTargetId)) {
      onSelectTarget(null)
    }
  }, [targets, selectedTargetId, onSelectTarget])

  useEffect(() => {
    if (!onArenaResolution) return
    const alive = new Set(targets.map(t => t.id))
    for (const b of targets) {
      if (!b.resolved || seenResolvedRef.current.has(b.id)) continue
      seenResolvedRef.current.add(b.id)
      const payoutEth = b.hit ? safeBet * b.mult : 0
      onArenaResolution({ hit: b.hit, mult: b.mult, payoutEth })
    }
    for (const id of [...seenResolvedRef.current]) {
      if (!alive.has(id)) seenResolvedRef.current.delete(id)
    }
  }, [targets, safeBet, onArenaResolution])

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-[28px] border-2 border-black/10 bg-white shadow-[0_40px_120px_rgba(0,0,0,0.08)] overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full min-h-0 w-full flex-1 touch-none select-none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id={lineGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={cellGlowLightId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.accentSoft} />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
          <linearGradient id={trailFadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={T.accentBright} stopOpacity="0" />
            <stop offset="100%" stopColor={T.accentBright} stopOpacity="1" />
          </linearGradient>
        </defs>

        <rect width={W} height={H} fill={T.canvas} />

        {/* Head column tint — where boxes resolve */}
        <rect
          x={gl + HEAD_COL * cellW}
          y={gridTop}
          width={cellW}
          height={gridBottom - gridTop}
          fill="rgba(16,185,129,0.06)"
        />

        {/* Grid lines — only on the LEFT (trail) side of the head. The right
            side visuals come entirely from the scrolling numbered boxes. */}
        {Array.from({ length: HEAD_COL + 1 }, (_, i) => {
          const x = gl + i * cellW
          return <line key={`v-${i}`} x1={x} y1={gridTop} x2={x} y2={gridBottom} stroke={T.grid} strokeWidth="1" />
        })}
        {Array.from({ length: GRID_ROWS + 1 }, (_, i) => {
          const y = gridTop + i * cellH
          return <line key={`h-${i}`} x1={gl} y1={y} x2={gl + HEAD_COL * cellW} y2={y} stroke={T.gridStrong} strokeWidth="1" />
        })}

        {/* Scrolling target boxes — every lattice index renders exactly one box
            per row, and all boxes share the same fractional scroll offset, so
            they tile perfectly and never overlap each other. */}
        {targets.map(b => {
          const effectiveCol = b.lattice - scrollOffset
          const x = gl + effectiveCol * cellW
          const y = gridTop + b.row * cellH
          if (x + cellW < gl - cellW || x > chartRight + cellW) return null
          const isSelected = selectedTargetId === b.id
          const isAligned = !b.resolved && b.row === activeRow && Math.abs(effectiveCol - HEAD_COL) < 0.6
          const highlight = isAligned || isSelected
          const fill = b.resolved
            ? b.hit
              ? "rgba(16,185,129,0.18)"
              : "rgba(17,17,17,0.05)"
            : highlight
              ? T.cellActiveFill
              : "rgba(255,255,255,0.94)"
          const stroke = b.resolved
            ? b.hit
              ? "rgba(5,150,105,0.5)"
              : "rgba(17,17,17,0.14)"
            : highlight
              ? T.cellActiveStroke
              : T.cellIdleStroke
          const textColor = b.resolved
            ? b.hit
              ? "rgba(5,150,105,0.9)"
              : "rgba(17,17,17,0.25)"
            : highlight
              ? T.cellTextActive
              : "rgba(17,17,17,0.55)"
          return (
            <g key={b.id} opacity={b.resolved ? 0.72 : 1}>
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={cellW - 3}
                height={cellH - 3}
                rx={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={highlight ? 1.75 : 1}
                style={{ filter: highlight ? `url(#${cellGlowLightId})` : undefined }}
                className={b.resolved ? "" : "cursor-pointer"}
                onClick={e => {
                  if (b.resolved) return
                  e.stopPropagation()
                  onSelectTarget(isSelected ? null : b.id)
                }}
              />
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 5}
                textAnchor="middle"
                fill={textColor}
                style={{
                  fontSize: 15,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: highlight ? 700 : 600,
                  letterSpacing: "0.02em",
                }}
              >
                {b.mult.toFixed(2)}x
              </text>
              {isSelected && !b.resolved && safeBet > 0 && (
                <text
                  x={x + cellW / 2}
                  y={y + cellH - 8}
                  textAnchor="middle"
                  fill="rgba(5,150,105,0.9)"
                  style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}
                >
                  WIN {(safeBet * b.mult).toFixed(3)}
                </text>
              )}
              {b.resolved && b.hit && (
                <text
                  x={x + cellW / 2}
                  y={y + cellH - 8}
                  textAnchor="middle"
                  fill="rgba(5,150,105,0.85)"
                  style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}
                >
                  HIT
                </text>
              )}
            </g>
          )
        })}

        {/* Trail area */}
        {pathD && (
          <path
            d={`${pathD} L ${headX} ${H - PAD.b} L ${gl} ${H - PAD.b} Z`}
            fill={`url(#${areaFillId})`}
            opacity={0.8}
          />
        )}

        {/* Trail line */}
        <path
          d={pathD}
          fill="none"
          stroke={`url(#${trailFadeId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${lineGlowId})`}
          opacity={0.95}
        />

        {/* Head column marker */}
        <line
          x1={headX}
          y1={gridTop}
          x2={headX}
          y2={gridBottom}
          stroke={T.accentGlow}
          strokeWidth="1.2"
          strokeDasharray="5 5"
        />

        {/* Head dot */}
        <circle cx={headX} cy={headY} r={8} fill={T.surface} stroke={T.accent} strokeWidth="3" />
        <circle cx={headX} cy={headY} r={3} fill={T.accent} />

        {/* Price axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(g => {
          const y = PAD.t + g * (H - PAD.t - PAD.b)
          const val = minP + (1 - g) * (maxP - minP)
          return (
            <text
              key={g}
              x={14}
              y={y + 4}
              fill={T.mutedLight}
              style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
            >
              {val.toFixed(0)}
            </text>
          )
        })}
      </svg>

      {hitFlash && (
        <div className="absolute left-1/2 top-[38%] z-30 -translate-x-1/2 pointer-events-none" key={hitFlash.at}>
          <div className="rounded-2xl border border-emerald-600/25 bg-emerald-50/95 px-5 py-3 text-center shadow-xl backdrop-blur-sm dashboard-hit-pop">
            <p className="text-[11px] tracking-[0.2em] text-emerald-800/90 uppercase">Triggered</p>
            <p className="mt-0.5 text-base font-light text-emerald-950 tabular-nums" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
              {hitFlash.label}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
