import { ARENA_POOL_BY_ID, getPoolChartSim, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { uniswapV3FeeTierFromLabel } from "@/lib/trading/arena-pool-onchain"

/** Display / arena economics — floor and cap for multipliers (`box.md`). */
export const ARENA_MULT_MIN = 1.05
export const ARENA_MULT_MAX = 5.5

/**
 * Reference span in **chart coordinate** units for normalizing `(high - low)`.
 * Anchored to pool sim amplitude so different pools get comparable narrowness scores.
 */
export function chartCoordSpanReference(arenaPoolId: ArenaPoolId): number {
  const s = getPoolChartSim(arenaPoolId)
  return Math.max(4, s.amp * 4)
}

/**
 * Fee-tier adjustment: same geometric band implies different fee economics (`mechanics.md`).
 * Uses subgraph-style fee tier (100 = 0.01%, 500 = 0.05%, 3000 = 0.3%).
 */
export function feeTierArenaFactor(arenaPoolId: ArenaPoolId): number {
  const label = ARENA_POOL_BY_ID[arenaPoolId]?.feeTier ?? "0.05%"
  const tier = uniswapV3FeeTierFromLabel(label)
  if (tier === undefined) return 1
  // Higher fee → slightly higher arena score at equal width (more fee capture per liquidity).
  if (tier <= 100) return 0.94
  if (tier <= 500) return 1
  if (tier <= 3000) return 1.06
  return 1.08
}

/**
 * Subgraph-backed pool activity (24h volume/fees, TVL) used to nudge arena multipliers.
 * All fields optional; when missing, geometry + fee tier only (unchanged behavior).
 */
export type ArenaPoolSubgraphSnapshot = {
  volumeUsd24h?: number
  feesUsd24h?: number
  totalValueLockedUsd?: number
  /** Current pool tick (Uniswap v3) when available. */
  tickCurrent?: number
}

function parseUsdField(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined
  const n = Number.parseFloat(String(raw).replace(/,/g, ""))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/**
 * Build a numeric snapshot from API / Mongo string fields (client or server).
 */
export function arenaSubgraphSnapshotFromStrings(
  input:
    | {
        volumeUsd24h?: string
        feesUsd24h?: string
        totalValueLockedUsd?: string
        tick?: string
      }
    | null
    | undefined,
): ArenaPoolSubgraphSnapshot | null {
  if (!input) return null
  const volumeUsd24h = parseUsdField(input.volumeUsd24h)
  const feesUsd24h = parseUsdField(input.feesUsd24h)
  const totalValueLockedUsd = parseUsdField(input.totalValueLockedUsd)
  const tickN = input.tick !== undefined && input.tick !== "" ? Number.parseInt(String(input.tick), 10) : NaN
  const tickCurrent = Number.isFinite(tickN) ? tickN : undefined
  if (
    volumeUsd24h === undefined &&
    feesUsd24h === undefined &&
    totalValueLockedUsd === undefined &&
    tickCurrent === undefined
  ) {
    return null
  }
  return {
    volumeUsd24h,
    feesUsd24h,
    totalValueLockedUsd,
    tickCurrent,
  }
}

/**
 * Multiplier factor in ~[0.88, 1.12] from 24h activity vs TVL. Returns 1 when no usable data.
 */
export function subgraphActivityBoost(
  snapshot: ArenaPoolSubgraphSnapshot | null | undefined,
): number {
  if (!snapshot) return 1
  const V = snapshot.volumeUsd24h
  const F = snapshot.feesUsd24h
  const T = snapshot.totalValueLockedUsd
  const hasV = V !== undefined && V > 0
  const hasF = F !== undefined && F > 0
  if (!hasV && !hasF) return 1
  const t = T !== undefined && T > 0 ? T : 0
  // Turnover and fee-yield proxies (dimensionless scores 0..1).
  const turnover = t > 0 && hasV && V !== undefined ? V / t : hasV && V !== undefined ? Math.log1p(V) / 12 : 0
  const tScore = Math.min(1, Math.log1p(turnover) / Math.log1p(4))
  const feeYield = t > 0 && hasF && F !== undefined ? F / t : 0
  const fScore = Math.min(1, feeYield * 350)
  const s = 0.55 * tScore + 0.45 * fScore
  if (s <= 0) return 0.92
  return 0.88 + s * 0.24
}

export type ArenaMultiplierBandInput = {
  chartLow: number
  chartHigh: number
  spotChartCoord: number
  arenaPoolId: ArenaPoolId
  /** Optional 0–1 dampener (e.g. high-vol regime). Default 1. */
  stressDampener?: number
  /** Optional subgraph 24h metrics; blends with band math when present. */
  subgraph?: ArenaPoolSubgraphSnapshot | null
}

/**
 * Multiplier for a price box in chart-coordinate space:
 * - Narrower `(high - low)` vs reference span → higher mult (concentrated liquidity intuition).
 * - Box center closer to spot → higher mult.
 * - Fee tier scales economics.
 * - Clamped to `[ARENA_MULT_MIN, ARENA_MULT_MAX]`.
 */
export function computeArenaMultiplierFromChartBand(input: ArenaMultiplierBandInput): number {
  const spanRef = chartCoordSpanReference(input.arenaPoolId)
  const width = Math.abs(input.chartHigh - input.chartLow)
  const center = (input.chartLow + input.chartHigh) / 2
  const dist = Math.abs(center - input.spotChartCoord)

  const relativeWidth = width / spanRef
  const narrowScore = 1 / (relativeWidth + 0.09)
  const alignment = 1 / (1 + (dist / spanRef) * 2.8)

  const damp = input.stressDampener ?? 1
  let mult =
    1.08 + Math.log1p(narrowScore * 1.15) * 0.92 * alignment * feeTierArenaFactor(input.arenaPoolId) * damp

  const act = subgraphActivityBoost(input.subgraph)
  mult *= act

  mult = Math.min(ARENA_MULT_MAX, Math.max(ARENA_MULT_MIN, mult))
  return Math.round(mult * 100) / 100
}

export type ArenaGridCellMultiplierInput = {
  row: number
  activeRow: number
  gridRows: number
  /** Current spot in the same chart-coordinate space as price boxes. */
  spotChartCoord: number
  arenaPoolId: ArenaPoolId
  /**
   * Visual jitter (default 1). Use a deterministic 0.94–1.12 hash for SSR-safe grids
   * or `Math.random()` for spawned cells.
   */
  jitter?: number
  /** Matches server tick when pools list exposes 24h subgraph fields. */
  subgraph?: ArenaPoolSubgraphSnapshot | null
}

/**
 * Scrolling arena cells: each row is a band of width `spanRef / gridRows` centered
 * at `spotChartCoord + (row - activeRow) * band` so rows aligned with the head
 * are tight around spot (higher mult), edge rows are “wider” in effect.
 */
export function multiplierForArenaGridCell(input: ArenaGridCellMultiplierInput): number {
  const spanRef = chartCoordSpanReference(input.arenaPoolId)
  const band = spanRef / input.gridRows
  const rowCenter = input.spotChartCoord + (input.row - input.activeRow) * band
  const chartLow = rowCenter - band / 2
  const chartHigh = rowCenter + band / 2

  let m = computeArenaMultiplierFromChartBand({
    chartLow,
    chartHigh,
    spotChartCoord: input.spotChartCoord,
    arenaPoolId: input.arenaPoolId,
    subgraph: input.subgraph,
  })
  const j = input.jitter ?? 1
  if (Number.isFinite(j) && j > 0) {
    m *= Math.min(1.15, Math.max(0.88, j))
  }
  m = Math.min(ARENA_MULT_MAX, Math.max(ARENA_MULT_MIN, m))
  return Math.round(m * 100) / 100
}

/** Deterministic jitter in [lo, hi] from an integer seed (no Math.random). */
export function arenaMultiplierJitterFromSeed(seed: number, lo = 0.94, hi = 1.12): number {
  const h = ((seed * 9301 + 49297) % 233280) / 233280
  return lo + h * (hi - lo)
}
