/** Fixed arena pools — shared environment (`mechanics.md`). Prices fluctuate per pool in the UI. */
export const ARENA_POOL_IDS = ["eth-usdc", "wbtc-eth", "usdc-usdt"] as const
export type ArenaPoolId = (typeof ARENA_POOL_IDS)[number]

export type ArenaPoolDef = {
  id: ArenaPoolId
  basePair: string
  feeTier: string
  /** Row in dropdown + badges */
  label: string
  /** Short tag next to “Live · …” */
  livePairTag: string
}

export const ARENA_POOLS: ArenaPoolDef[] = [
  {
    id: "eth-usdc",
    basePair: "ETH / USDC",
    feeTier: "0.05%",
    label: "ETH / USDC · 0.05%",
    livePairTag: "ETH / USDC",
  },
  {
    id: "wbtc-eth",
    basePair: "WBTC / ETH",
    feeTier: "0.05%",
    label: "WBTC / ETH · 0.05%",
    livePairTag: "WBTC / ETH",
  },
  {
    id: "usdc-usdt",
    basePair: "USDC / USDT",
    feeTier: "0.01%",
    label: "USDC / USDT · 0.01%",
    livePairTag: "USDC / USDT",
  },
]

export const ARENA_POOL_BY_ID = Object.fromEntries(ARENA_POOLS.map(p => [p.id, p])) as Record<ArenaPoolId, ArenaPoolDef>

/** Simulation tuning per pool — distinct motion + quote display on the chart. */
export function getPoolChartSim(poolId: string): {
  mid: number
  phase: number
  amp: number
  usdFromSim: (p: number) => number
} {
  const specs: Record<string, { mid: number; phase: number; amp: number; usdBase: number; usdPerSimUnit: number }> = {
    "eth-usdc": { mid: 54, phase: 0, amp: 10, usdBase: 2306.94, usdPerSimUnit: 14.2 },
    "wbtc-eth": { mid: 53, phase: 1.85, amp: 11, usdBase: 43_180, usdPerSimUnit: 220 },
    "usdc-usdt": { mid: 56, phase: 0.65, amp: 4.5, usdBase: 1.0, usdPerSimUnit: 0.0004 },
  }
  const s = specs[poolId] ?? specs["eth-usdc"]!
  return {
    mid: s.mid,
    phase: s.phase,
    amp: s.amp,
    usdFromSim: (p: number) => s.usdBase + (p - s.mid) * s.usdPerSimUnit,
  }
}

export function getTradableArenaPools(tradeAllPools: boolean, enabledPoolIds: readonly string[]): ArenaPoolDef[] {
  const ids = tradeAllPools ? ARENA_POOL_IDS.slice() : enabledPoolIds
  const set = new Set(ids)
  return ARENA_POOLS.filter(p => set.has(p.id))
}

/** Ensure enabled IDs are valid; default to ETH/USDC pool. */
export function normalizeEnabledPoolIds(ids: unknown): ArenaPoolId[] {
  if (!Array.isArray(ids)) return ["eth-usdc"]
  const ok = ids.filter((x): x is ArenaPoolId => ARENA_POOL_IDS.includes(x as ArenaPoolId))
  return ok.length > 0 ? ok : ["eth-usdc"]
}

function poolComposite(p: ArenaPoolDef): string {
  return `${p.basePair.trim()} · ${p.feeTier.trim()}`
}

/** Match legacy `pool` / basePair+feeTier to a canonical arena pool. */
export function inferArenaPoolFromLegacyFields(fields: {
  pool?: string
  basePair?: string
  feeTier?: string
}): ArenaPoolDef {
  const poolStr = fields.pool?.trim()
  if (poolStr) {
    const hit = ARENA_POOLS.find(p => p.label === poolStr || poolComposite(p) === poolStr)
    if (hit) return hit
  }
  const bp = fields.basePair?.trim()
  const ft = fields.feeTier?.trim()
  if (bp && ft) {
    const hit = ARENA_POOLS.find(p => p.basePair === bp && p.feeTier === ft)
    if (hit) return hit
  }
  return ARENA_POOLS[0]!
}
