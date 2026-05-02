"use client"

import { useState } from "react"
import type { PriceBox } from "@/components/dashboard/types"

export const DEFAULT_BOXES: PriceBox[] = [
  {
    id: "demo-1",
    label: "Add LP",
    low: 48,
    high: 54,
    action: "add_liquidity",
    color: "#6366f1",
    hitLabel: "+0.5 ETH + 1.2k USDC in range",
  },
  {
    id: "demo-2",
    label: "Swap partial",
    low: 55,
    high: 59,
    action: "swap",
    color: "#c084fc",
    hitLabel: "−0.2 ETH → +610 USDC",
  },
  {
    id: "demo-3",
    label: "Claim / trim",
    low: 60,
    high: 65,
    action: "remove_liquidity",
    color: "#38bdf8",
    hitLabel: "+$180 fees · −15% range width",
  },
]

const BAR = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  background: "rgba(255,255,255,0.72)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)",
} as const

type Props = {
  onApplyBoxes?: (boxes: PriceBox[]) => void
  agentStatus: "idle" | "armed" | "running"
  onStatusChange: (s: "idle" | "armed" | "running") => void
}

function fieldClass() {
  return "w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
}

export function AgentCapsulePanel({ onApplyBoxes, agentStatus, onStatusChange }: Props) {
  const [name, setName] = useState("arena-alpha")
  const [goal, setGoal] = useState("Maximize yield on ETH/USDC with tight ranges when volatility is low.")
  const [capital, setCapital] = useState("2.5")
  const [token, setToken] = useState("ETH")
  const [chain, setChain] = useState("base-sepolia")
  const [pool, setPool] = useState("ETH / USDC · 0.05%")
  const [slippage, setSlippage] = useState("0.5")
  const [gasCap, setGasCap] = useState("45")

  function seedBoxesFromForm() {
    const base = 52 + Math.random() * 4
    const next: PriceBox[] = [
      {
        id: `bx-${Date.now()}-1`,
        label: "Add LP",
        low: base - 2,
        high: base + 1.5,
        action: "add_liquidity",
        color: "#6366f1",
        hitLabel: `+0.4 ${token} + 1.1k USDC in range`,
      },
      {
        id: `bx-${Date.now()}-2`,
        label: "Swap → USDC",
        low: base + 2,
        high: base + 5,
        action: "swap",
        color: "#c084fc",
        hitLabel: "−0.35 ETH → +1.05k USDC",
      },
      {
        id: `bx-${Date.now()}-3`,
        label: "Take profit",
        low: base + 6,
        high: base + 9,
        action: "remove_liquidity",
        color: "#38bdf8",
        hitLabel: "+$420 fees claimed",
      },
    ]
    onApplyBoxes?.(next)
    onStatusChange("running")
  }

  return (
    <aside
      className="w-full rounded-3xl border border-black/[0.07] p-4 md:p-5 flex flex-col gap-4 max-h-[calc(100vh-7rem)] overflow-y-auto"
      style={BAR}
    >
      <div>
        <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase mb-1">Agent</p>
        <h2
          className="text-lg md:text-xl font-light tracking-tight text-[#111] leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          Configure & run
        </h2>
        <p className="mt-1.5 text-[11px] text-black/38 leading-snug">
          Compact panel — chart stays primary.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Agent name</label>
          <input className={fieldClass()} value={name} onChange={e => setName(e.target.value)} placeholder="my-gladiator" />
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Goal</label>
          <textarea
            className={`${fieldClass()} min-h-[64px] resize-y leading-snug`}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Plain language strategy…"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Capital</label>
            <input className={fieldClass()} type="number" step="0.01" min={0} value={capital} onChange={e => setCapital(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Asset</label>
            <select className={fieldClass()} value={token} onChange={e => setToken(e.target.value)}>
              <option value="ETH">ETH</option>
              <option value="WETH">WETH</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Chain</label>
          <select className={fieldClass()} value={chain} onChange={e => setChain(e.target.value)}>
            <option value="base-sepolia">Base Sepolia</option>
            <option value="unichain-sepolia">Unichain Sepolia</option>
          </select>
        </div>

        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Allowed pool</label>
          <input className={fieldClass()} value={pool} onChange={e => setPool(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Max slippage %</label>
            <input className={fieldClass()} value={slippage} onChange={e => setSlippage(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Gas cap (gwei)</label>
            <input className={fieldClass()} value={gasCap} onChange={e => setGasCap(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => seedBoxesFromForm()}
          className="w-full px-4 py-2.5 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333] transition-colors"
        >
          Create agent & place boxes
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onStatusChange(agentStatus === "running" ? "idle" : "running")}
            className="flex-1 py-2 rounded-lg border border-black/10 text-xs text-black/70 hover:bg-black/[0.03] transition-colors tracking-wide"
          >
            {agentStatus === "running" ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => {
              onStatusChange("idle")
              onApplyBoxes?.(DEFAULT_BOXES)
            }}
            className="flex-1 py-2 rounded-lg border border-black/10 text-xs text-black/70 hover:bg-black/[0.03] transition-colors tracking-wide"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="text-[9px] text-black/30 leading-relaxed border-t border-black/[0.06] pt-3">
        Status: <span className="text-black/50">{agentStatus}</span> · Encrypted agent keys & tick loop ship next.
      </p>
    </aside>
  )
}
