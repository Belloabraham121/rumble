"use client"

import { useState, useEffect } from "react"
import {
  BASE_PAIR_OPTIONS,
  CHAIN_OPTIONS,
  DEFAULT_AGENT_CONFIG,
  FEE_TIER_OPTIONS,
  formatPoolLabel,
  type AgentConfig,
  type ReflectionDepth,
  type RiskLevel,
} from "@/lib/agents/agent-types"

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (config: AgentConfig) => void
  existingNames: string[]
}

function fieldClass() {
  return "w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

const RISK_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
]

const REFLECTION_DEPTH: { value: ReflectionDepth; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "deep", label: "Deep" },
]

export function CreateAgentModal({ open, onClose, onCreate, existingNames }: Props) {
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setNameTouched(false)
    const name = uniqueName("arena-alpha", new Set(existingNames))
    setCfg({
      ...DEFAULT_AGENT_CONFIG,
      name,
      pool: formatPoolLabel(DEFAULT_AGENT_CONFIG.basePair, DEFAULT_AGENT_CONFIG.feeTier),
    })
  }, [open, existingNames])

  if (!open) return null

  const nameInvalid = nameTouched && !cfg.name.trim()
  const duplicate = nameTouched && cfg.name.trim() && existingNames.includes(cfg.name.trim())

  function set<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setCfg(prev => {
      const next = { ...prev, [key]: value }
      if (key === "basePair" || key === "feeTier") {
        next.pool = formatPoolLabel(
          key === "basePair" ? (value as string) : prev.basePair,
          key === "feeTier" ? (value as string) : prev.feeTier,
        )
      }
      return next
    })
  }

  function submit() {
    const name = cfg.name.trim()
    if (!name || existingNames.includes(name)) {
      setNameTouched(true)
      return
    }
    onCreate({ ...cfg, name, pool: formatPoolLabel(cfg.basePair, cfg.feeTier) })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-[#FBFAF6] shadow-[0_40px_120px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <div>
            <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">New agent</p>
            <h3 className="text-base font-light text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
              Configure & launch
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full h-8 w-8 flex items-center justify-center text-black/50 hover:text-black hover:bg-black/[0.04] transition-colors"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Identity & strategy</p>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Agent name</label>
              <input
                className={fieldClass()}
                value={cfg.name}
                onChange={e => {
                  setNameTouched(true)
                  set("name", e.target.value)
                }}
                placeholder="my-gladiator"
              />
              {nameInvalid && <p className="mt-1 text-[10px] text-red-600/80">Name is required.</p>}
              {duplicate && <p className="mt-1 text-[10px] text-red-600/80">You already have an agent with this name.</p>}
            </div>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Version</label>
              <input className={fieldClass()} value={cfg.version} onChange={e => set("version", e.target.value)} placeholder="1.0.0" />
            </div>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Goal</label>
              <textarea
                className={`${fieldClass()} min-h-[64px] resize-y leading-snug`}
                value={cfg.goal}
                onChange={e => set("goal", e.target.value)}
                placeholder="Plain language strategy…"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Risk & capital</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Risk profile</label>
                <select className={fieldClass()} value={cfg.riskLevel} onChange={e => set("riskLevel", e.target.value as RiskLevel)}>
                  {RISK_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Capital</label>
                <input
                  className={fieldClass()}
                  type="number"
                  step="0.01"
                  min={0}
                  value={cfg.capital}
                  onChange={e => set("capital", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Denomination</label>
                <select className={fieldClass()} value={cfg.token} onChange={e => set("token", e.target.value)}>
                  <option value="ETH">ETH</option>
                  <option value="WETH">WETH</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Bet size</label>
                <input
                  className={fieldClass()}
                  type="number"
                  step="0.01"
                  min={0}
                  value={cfg.betAmount}
                  onChange={e => set("betAmount", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Markets</p>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Chain</label>
              <select className={fieldClass()} value={cfg.chain} onChange={e => set("chain", e.target.value)}>
                {CHAIN_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Base pair</label>
                <select className={fieldClass()} value={cfg.basePair} onChange={e => set("basePair", e.target.value)}>
                  {BASE_PAIR_OPTIONS.map(p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Fee tier</label>
                <select className={fieldClass()} value={cfg.feeTier} onChange={e => set("feeTier", e.target.value)}>
                  {FEE_TIER_OPTIONS.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Pool (derived)</label>
              <input className={`${fieldClass()} bg-black/[0.03] text-black/55`} readOnly value={cfg.pool} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Guardrails</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Max position %</label>
                <input className={fieldClass()} value={cfg.maxPositionPercent} onChange={e => set("maxPositionPercent", e.target.value)} />
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Slippage %</label>
                <input className={fieldClass()} value={cfg.slippage} onChange={e => set("slippage", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Gas cap (gwei)</label>
                <input className={fieldClass()} value={cfg.gasCap} onChange={e => set("gasCap", e.target.value)} />
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Approved tokens</label>
                <input
                  className={fieldClass()}
                  value={cfg.approvedTokens}
                  onChange={e => set("approvedTokens", e.target.value)}
                  placeholder="ETH, USDC, WETH"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Reflection</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Every N trades</label>
                <input
                  className={fieldClass()}
                  type="number"
                  min={1}
                  step={1}
                  value={cfg.reflectionFrequencyTrades}
                  onChange={e => set("reflectionFrequencyTrades", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Depth</label>
                <select
                  className={fieldClass()}
                  value={cfg.reflectionDepth}
                  onChange={e => set("reflectionDepth", e.target.value as ReflectionDepth)}
                >
                  {REFLECTION_DEPTH.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Price boxes (runtime)</p>
            <div className="rounded-xl border border-black/[0.07] bg-[#fafaf8]/90 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] tracking-widest text-black/40 uppercase">Live runtime simulation</p>
                <p className="text-[10px] text-black/38 mt-0.5 leading-snug">
                  Drift low/high, action, and amount % on a timer (preview only).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={cfg.runtimeBoxesLive}
                aria-label="Toggle live runtime simulation"
                onClick={() => set("runtimeBoxesLive", !cfg.runtimeBoxesLive)}
                className={`relative h-7 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
                  cfg.runtimeBoxesLive ? "bg-emerald-600" : "bg-black/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    cfg.runtimeBoxesLive ? "translate-x-[18px]" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-pixel text-[8px] tracking-[0.18em] text-black/35 uppercase">Funding</p>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Wallet / custody note</label>
              <textarea
                className={`${fieldClass()} min-h-[52px] resize-y leading-snug`}
                value={cfg.fundingWalletNote}
                onChange={e => set("fundingWalletNote", e.target.value)}
                placeholder="Optional note until live wallet is wired…"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-black/[0.06] flex items-center justify-end gap-2 bg-white/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-black/10 text-[11px] text-black/60 hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 rounded-lg bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333]"
          >
            Create & launch
          </button>
        </div>
      </div>
    </div>
  )
}
