import "server-only"

import { createHash } from "node:crypto"
import type { RiskLevel } from "@/lib/agents/agent-types"

export type RiskBands = {
  /** Multiplier range applied to the *output* leg of a simulated swap. < 1 → loss. */
  swap: { min: number; max: number }
  /** Net LP P&L as a fraction of withdrawn principal — negative = IL, positive = fees > IL. */
  lpFee: { min: number; max: number }
  /** Sim gas burned in ETH per action (uniform). */
  gasEth: { min: number; max: number }
}

const RISK_BANDS: Record<RiskLevel, RiskBands> = {
  conservative: {
    swap: { min: 0.92, max: 1.08 },
    lpFee: { min: -0.005, max: 0.015 },
    gasEth: { min: 0.00005, max: 0.0003 },
  },
  balanced: {
    swap: { min: 0.78, max: 1.3 },
    lpFee: { min: -0.02, max: 0.04 },
    gasEth: { min: 0.0001, max: 0.0006 },
  },
  aggressive: {
    swap: { min: 0.55, max: 1.85 },
    lpFee: { min: -0.06, max: 0.1 },
    gasEth: { min: 0.0002, max: 0.001 },
  },
}

export function getRiskBands(risk: RiskLevel): RiskBands {
  return RISK_BANDS[risk] ?? RISK_BANDS.balanced
}

export function clampToBand(value: number, band: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return (band.min + band.max) / 2
  return Math.min(band.max, Math.max(band.min, value))
}

/** Deterministic mulberry32 RNG seeded from a string. */
export function seededRandom(seed: string): () => number {
  const hash = createHash("sha256").update(seed).digest()
  let s = hash.readUInt32BE(0) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rollInBand(rng: () => number, band: { min: number; max: number }): number {
  return band.min + rng() * (band.max - band.min)
}

/**
 * Synthesize a 32-byte transaction hash from the agent tick's idempotency key.
 * Stable across retries (same key → same hash) so re-tick attempts are idempotent
 * against `trading_attempts` + `onchain_receipts` upserts, but indistinguishable
 * from a real on-chain hash to downstream readers.
 */
export function syntheticTxHash(seed: string): string {
  const h = createHash("sha256").update(`rombo-sim:${seed}`).digest("hex")
  return `0x${h}`
}

/** Plausible block number — Base mainnet block time ≈ 2s. */
export function syntheticBlockNumber(): number {
  return Math.floor(Date.now() / 2_000)
}

/** Realistic gasUsed range for a Uniswap swap or LP op. */
export function syntheticGasUsed(rng: () => number, kind: "swap" | "lp_create" | "lp_increase" | "lp_decrease"): string {
  const ranges: Record<typeof kind, { min: number; max: number }> = {
    swap: { min: 120_000, max: 220_000 },
    lp_create: { min: 380_000, max: 540_000 },
    lp_increase: { min: 220_000, max: 360_000 },
    lp_decrease: { min: 200_000, max: 320_000 },
  }
  const r = ranges[kind]
  return String(Math.round(r.min + rng() * (r.max - r.min)))
}

/** Effective gas price in wei — Base testnet typically <1 gwei, mainnet ~0.01–0.5 gwei. */
export function syntheticEffectiveGasPriceWei(rng: () => number, chainId: number): string {
  // Base mainnet (8453) is cheaper; Base Sepolia (84532) similar.
  const base = chainId === 8453 ? 0.05e9 : 0.1e9
  const jitter = base * (0.5 + rng() * 1.5)
  return String(Math.round(jitter))
}
