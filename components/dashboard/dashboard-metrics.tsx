"use client"

type Props = {
  pnlEth: number
  gasGweiTotal: number
  actions: number
  winRate: number
}

export function DashboardMetrics({ pnlEth, gasGweiTotal, actions, winRate }: Props) {
  const cards = [
    { label: "Est. PnL", value: `${pnlEth >= 0 ? "+" : ""}${pnlEth.toFixed(4)} ETH`, sub: "simulated" },
    { label: "Gas (Σ)", value: `${Math.round(gasGweiTotal)} gwei`, sub: "cumulative" },
    { label: "Actions", value: `${actions}`, sub: "fills + skips" },
    { label: "Win rate", value: `${(winRate * 100).toFixed(0)}%`, sub: "hits / fills" },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map(c => (
        <div
          key={c.label}
          className="rounded-xl border border-black/[0.07] bg-white/90 px-3 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.04)]"
        >
          <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">{c.label}</p>
          <p className="mt-1 text-sm tabular-nums text-[#111] font-medium" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
            {c.value}
          </p>
          <p className="text-[9px] text-black/32 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
