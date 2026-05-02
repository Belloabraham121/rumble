"use client"

import { useState, useEffect } from "react"
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from "@/lib/agents/agent-types"

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

export function CreateAgentModal({ open, onClose, onCreate, existingNames }: Props) {
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setNameTouched(false)
    setCfg({ ...DEFAULT_AGENT_CONFIG, name: uniqueName("arena-alpha", new Set(existingNames)) })
  }, [open, existingNames])

  if (!open) return null

  const nameInvalid = nameTouched && !cfg.name.trim()
  const duplicate = nameTouched && cfg.name.trim() && existingNames.includes(cfg.name.trim())

  function set<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  function submit() {
    const name = cfg.name.trim()
    if (!name || existingNames.includes(name)) {
      setNameTouched(true)
      return
    }
    onCreate({ ...cfg, name })
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
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-[#FBFAF6] shadow-[0_40px_120px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <div>
            <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">New agent</p>
            <h3 className="text-base font-light text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
              Create & launch
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

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
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
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Goal</label>
            <textarea
              className={`${fieldClass()} min-h-[64px] resize-y leading-snug`}
              value={cfg.goal}
              onChange={e => set("goal", e.target.value)}
              placeholder="Plain language strategy…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
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
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Asset</label>
              <select className={fieldClass()} value={cfg.token} onChange={e => set("token", e.target.value)}>
                <option value="ETH">ETH</option>
                <option value="WETH">WETH</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Chain</label>
            <select className={fieldClass()} value={cfg.chain} onChange={e => set("chain", e.target.value)}>
              <option value="base-sepolia">Base Sepolia</option>
              <option value="unichain-sepolia">Unichain Sepolia</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Allowed pool</label>
            <input className={fieldClass()} value={cfg.pool} onChange={e => set("pool", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Slip %</label>
              <input className={fieldClass()} value={cfg.slippage} onChange={e => set("slippage", e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Gas (gwei)</label>
              <input className={fieldClass()} value={cfg.gasCap} onChange={e => set("gasCap", e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Bet (ETH)</label>
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
