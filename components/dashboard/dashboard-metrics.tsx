"use client"

import type { MetricsRange } from "@/lib/agents/metrics-types"
import { formatSignedUsd } from "@/components/dashboard/pnl-usdc"

type Props = {
  range: MetricsRange
  onRangeChange: (r: MetricsRange) => void
  /** Net PnL (USD) — swap leg − gas when backend fills swap USD; negative gas-only until then. */
  netPnlUsd: number
  /** Gas cost (USD) from receipts × spot ETH/USD. */
  gasUsd?: number
  /** Fallback when metrics API unavailable — legacy cumulative gwei from local totals. */
  gasGweiLegacy?: number
  actions: number
  winRate: number
  loading?: boolean
}

function fmtUsdPlain(n: number): string {
  const abs = Math.abs(n)
  return `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DashboardMetrics({
  range,
  onRangeChange,
  netPnlUsd,
  gasUsd,
  gasGweiLegacy = 0,
  actions,
  winRate,
  loading = false,
}: Props) {
  const hasGasUsd = gasUsd !== undefined && Number.isFinite(gasUsd)

  const cards = [
    { label: "Net PnL", value: formatSignedUsd(netPnlUsd), sub: "swap − gas (USD)" },
    {
      label: "Gas (Σ)",
      value: hasGasUsd ? fmtUsdPlain(gasUsd) : `${Math.round(gasGweiLegacy)} gwei`,
      sub: hasGasUsd ? "Σ gas · receipts · ETH spot" : "cumulative (legacy)",
    },
    { label: "Actions", value: `${actions}`, sub: "OK Trading API calls" },
    { label: "Win rate", value: `${(winRate * 100).toFixed(0)}%`, sub: "fills / (fills + skips)" },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Range</p>
        <select
          className="rounded-lg border border-black/[0.08] bg-white/95 px-2 py-1 text-[10px] text-[#111] font-medium focus:outline-none focus:ring-1 focus:ring-black/15"
          value={range}
          onChange={e => onRangeChange(e.target.value as MetricsRange)}
          aria-label="Metrics time range"
          disabled={loading}
        >
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className={`grid grid-cols-2 gap-2 ${loading ? "opacity-70" : ""}`}>
        {cards.map(c => (
          <div
            key={c.label}
            className="rounded-xl border border-black/[0.07] bg-white/90 px-3 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.04)]"
          >
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">{c.label}</p>
            <p
              className="mt-1 text-sm tabular-nums text-[#111] font-medium"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              {c.value}
            </p>
            <p className="text-[9px] text-black/32 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
