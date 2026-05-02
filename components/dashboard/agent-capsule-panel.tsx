"use client"

import {
  CHAIN_OPTIONS,
  DEFAULT_RUNTIME_BOXES,
  formatPoolLabel,
  type AgentConfig,
  type AgentStatus,
} from "@/lib/agents/agent-types"
import {
  ARENA_POOLS,
  normalizeEnabledPoolIds,
  type ArenaPoolId,
} from "@/lib/agents/arena-pools"
import type { PriceBox } from "@/components/dashboard/types"

const BAR = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  background: "rgba(255,255,255,0.72)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)",
} as const

type Props = {
  config: AgentConfig
  onConfigChange: (patch: Partial<AgentConfig>) => void
  boxes: PriceBox[]
  onBoxesChange: (boxes: PriceBox[]) => void
  agentStatus: AgentStatus
  onStatusChange: (s: AgentStatus) => void
}

function fieldClass() {
  return "w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-pixel text-[9px] tracking-[0.18em] text-black/40 uppercase border-t border-black/[0.06] pt-4 mt-4 first:mt-0 first:border-0 first:pt-0">
      {children}
    </p>
  )
}

const ACTION_OPTS: { value: PriceBox["action"]; label: string }[] = [
  { value: "add_liquidity", label: "Add liquidity" },
  { value: "swap", label: "Swap" },
  { value: "remove_liquidity", label: "Remove liquidity" },
]

export function AgentCapsulePanel({
  config,
  onConfigChange,
  boxes,
  onBoxesChange,
  agentStatus,
  onStatusChange,
}: Props) {
  function set<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    if (key === "basePair") {
      const bp = value as string
      onConfigChange({ basePair: bp, pool: formatPoolLabel(bp, config.feeTier) })
      return
    }
    if (key === "feeTier") {
      const ft = value as string
      onConfigChange({ feeTier: ft, pool: formatPoolLabel(config.basePair, ft) })
      return
    }
    onConfigChange({ [key]: value } as Partial<AgentConfig>)
  }

  function patchBox(index: number, patch: Partial<PriceBox>) {
    onBoxesChange(boxes.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  function toggleTradeAll(on: boolean) {
    const primary = ARENA_POOLS[0]!
    onConfigChange({
      tradeAllPools: on,
      basePair: primary.basePair,
      feeTier: primary.feeTier,
      pool: formatPoolLabel(primary.basePair, primary.feeTier),
    })
  }

  function togglePool(id: ArenaPoolId) {
    if (config.tradeAllPools) return
    const cur = new Set(config.enabledPoolIds)
    if (cur.has(id)) {
      if (cur.size <= 1) return
      cur.delete(id)
    } else {
      cur.add(id)
    }
    const next = normalizeEnabledPoolIds([...cur])
    const primary = ARENA_POOLS.find(p => next.includes(p.id)) ?? ARENA_POOLS[0]!
    onConfigChange({
      enabledPoolIds: next,
      basePair: primary.basePair,
      feeTier: primary.feeTier,
      pool: formatPoolLabel(primary.basePair, primary.feeTier),
    })
  }

  function seedBoxesFromRisk() {
    const spread = { conservative: 1.35, balanced: 1, aggressive: 0.72 }[config.riskLevel]
    const base = 52 + Math.random() * 4
    const w = 3 * spread
    const next: PriceBox[] = [
      {
        id: `bx-${Date.now()}-1`,
        label: "Add LP",
        low: base - 2 * spread,
        high: base + 1.5 * spread,
        action: "add_liquidity",
        color: "#6366f1",
        hitLabel: `+0.4 ${config.token} + 1.1k USDC in range`,
        amountPercent: "40",
      },
      {
        id: `bx-${Date.now()}-2`,
        label: "Swap → USDC",
        low: base + 2 * spread,
        high: base + 5 * spread,
        action: "swap",
        color: "#c084fc",
        hitLabel: "−0.35 ETH → +1.05k USDC",
        amountPercent: "35",
      },
      {
        id: `bx-${Date.now()}-3`,
        label: "Take profit",
        low: base + 6 * spread,
        high: base + 9 * spread,
        action: "remove_liquidity",
        color: "#38bdf8",
        hitLabel: "+$420 fees claimed",
        amountPercent: "25",
      },
    ]
    onBoxesChange(next)
    onStatusChange("running")
  }

  return (
    <aside
      className="w-full rounded-3xl border border-black/[0.07] p-4 md:p-5 flex flex-col gap-3 max-h-[calc(100vh-7rem)] overflow-y-auto"
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
          Matches Rombo agent spec — saved locally until APIs ship.
        </p>
      </div>

      <SectionTitle>Identity & strategy</SectionTitle>
      <div className="space-y-3">
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Agent name</label>
          <input className={fieldClass()} value={config.name} onChange={e => set("name", e.target.value)} placeholder="my-gladiator" />
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Goal / strategy</label>
          <textarea
            className={`${fieldClass()} min-h-[72px] resize-y leading-snug`}
            value={config.goal}
            onChange={e => set("goal", e.target.value)}
            placeholder="Plain language strategy…"
          />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-[#fafaf8]/90 px-3 py-2">
          <span className="text-[9px] tracking-widest text-black/35 uppercase">Version</span>
          <span className="text-xs font-mono text-black/70">{config.version}</span>
        </div>
      </div>

      <SectionTitle>Risk & capital</SectionTitle>
      <div className="space-y-3">
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Risk level</label>
          <select className={fieldClass()} value={config.riskLevel} onChange={e => set("riskLevel", e.target.value as AgentConfig["riskLevel"])}>
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Initial capital target</label>
            <input
              className={fieldClass()}
              type="number"
              step="0.01"
              min={0}
              value={config.capital}
              onChange={e => set("capital", e.target.value)}
            />
          </div>
          <div className="pt-5">
            <select className={fieldClass()} value={config.token} onChange={e => set("token", e.target.value)}>
              <option value="ETH">ETH</option>
              <option value="WETH">WETH</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
        </div>
      </div>

      <SectionTitle>Markets</SectionTitle>
      <div className="space-y-3">
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Chain</label>
          <select className={fieldClass()} value={config.chain} onChange={e => set("chain", e.target.value)}>
            {CHAIN_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-black/[0.06] bg-[#fafaf8]/90 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-black/20"
            checked={config.tradeAllPools}
            onChange={e => toggleTradeAll(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-[10px] font-medium text-black/65">Trade all arena pools</span>
            <span className="block text-[9px] text-black/38 leading-snug mt-0.5">
              Same shared pools as other agents — ETH/USDC, WBTC/ETH, USDC/USDT on this chain.
            </span>
          </span>
        </label>

        {!config.tradeAllPools && (
          <div className="rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 space-y-2">
            <p className="text-[9px] tracking-widest text-black/35 uppercase">Pool access</p>
            <div className="space-y-1.5">
              {ARENA_POOLS.map(pool => {
                const checked = config.enabledPoolIds.includes(pool.id)
                const onlyOne = config.enabledPoolIds.length === 1 && checked
                return (
                  <label key={pool.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-black/20"
                      checked={checked}
                      disabled={onlyOne}
                      onChange={() => togglePool(pool.id)}
                    />
                    <span className="text-[11px] text-black/70">{pool.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] text-black/40 leading-snug">
          Primary routing (display):{" "}
          <span className="font-medium text-black/55">{config.pool}</span>
        </p>
      </div>

      <SectionTitle>Guardrails</SectionTitle>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Max slippage %</label>
            <input className={fieldClass()} value={config.slippage} onChange={e => set("slippage", e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Gas cap (gwei)</label>
            <input className={fieldClass()} value={config.gasCap} onChange={e => set("gasCap", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Max position % of capital</label>
          <input
            className={fieldClass()}
            type="number"
            step="1"
            min={1}
            max={100}
            value={config.maxPositionPercent}
            onChange={e => set("maxPositionPercent", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Approved tokens</label>
          <input
            className={fieldClass()}
            value={config.approvedTokens}
            onChange={e => set("approvedTokens", e.target.value)}
            placeholder="ETH, USDC, WETH"
          />
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Arena bet (ETH)</label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className={fieldClass()}
              type="number"
              step="0.01"
              min={0}
              value={config.betAmount}
              onChange={e => set("betAmount", e.target.value)}
            />
            <span className="inline-flex items-center px-2 rounded-lg bg-black/[0.04] text-[10px] text-black/40 border border-black/10">
              ETH
            </span>
          </div>
        </div>
      </div>

      <SectionTitle>Reflection (runtime)</SectionTitle>
      <div className="space-y-3">
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Every N trades</label>
          <input
            className={fieldClass()}
            type="number"
            step="1"
            min={5}
            value={config.reflectionFrequencyTrades}
            onChange={e => set("reflectionFrequencyTrades", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Reflection depth</label>
          <select
            className={fieldClass()}
            value={config.reflectionDepth}
            onChange={e => set("reflectionDepth", e.target.value as AgentConfig["reflectionDepth"])}
          >
            <option value="light">Light</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </div>
      </div>

      <SectionTitle>Funding</SectionTitle>
      <div className="rounded-xl border border-dashed border-black/15 bg-[#fafaf8]/90 px-3 py-2.5 space-y-1">
        <p className="text-[10px] text-black/45 leading-relaxed">
          When backend ships: a dedicated testnet wallet is assigned here; you fund it and the tick loop starts onchain.
        </p>
        <label className="block text-[9px] tracking-widest text-black/35 uppercase mb-1">Notes</label>
        <input
          className={fieldClass()}
          value={config.fundingWalletNote}
          onChange={e => set("fundingWalletNote", e.target.value)}
          placeholder="Optional reminder (e.g. fund via bridge…)"
        />
      </div>

      <SectionTitle>Price boxes (runtime)</SectionTitle>
      <p className="text-[10px] text-black/38 leading-snug -mt-1 mb-2">
        Low / high simulate chart triggers; action & % apply on hit (`agent.md`).
      </p>

      <div className="rounded-xl border border-black/[0.07] bg-[#fafaf8]/90 px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] tracking-widest text-black/40 uppercase">Live runtime simulation</p>
          <p className="text-[10px] text-black/38 mt-0.5 leading-snug">
            On: low/high, action, and % drift in real time. Off: edit manually.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.runtimeBoxesLive}
          aria-label="Toggle live runtime simulation for price boxes"
          onClick={() => onConfigChange({ runtimeBoxesLive: !config.runtimeBoxesLive })}
          className={`relative h-7 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
            config.runtimeBoxesLive ? "bg-emerald-600" : "bg-black/15"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              config.runtimeBoxesLive ? "translate-x-[18px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {config.runtimeBoxesLive && (
        <p className="text-[10px] text-emerald-800/80 bg-emerald-500/10 border border-emerald-600/15 rounded-lg px-2.5 py-1.5">
          Simulation active — values update automatically. Turn off to type custom runtimes.
        </p>
      )}

      <div className={`space-y-3 ${config.runtimeBoxesLive ? "opacity-[0.88] pointer-events-none" : ""}`}>
        {boxes.map((box, idx) => (
          <div key={box.id} className="rounded-xl border border-black/[0.07] bg-white/80 p-3 space-y-2">
            <input
              className={fieldClass()}
              value={box.label}
              readOnly={config.runtimeBoxesLive}
              onChange={e => patchBox(idx, { label: e.target.value })}
              placeholder="Label"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[8px] text-black/35 uppercase mb-0.5">Low</label>
                <input
                  className={fieldClass()}
                  type="number"
                  step="0.1"
                  value={box.low}
                  readOnly={config.runtimeBoxesLive}
                  onChange={e => patchBox(idx, { low: Number.parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-[8px] text-black/35 uppercase mb-0.5">High</label>
                <input
                  className={fieldClass()}
                  type="number"
                  step="0.1"
                  value={box.high}
                  readOnly={config.runtimeBoxesLive}
                  onChange={e => patchBox(idx, { high: Number.parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[8px] text-black/35 uppercase mb-0.5">Action</label>
                <select
                  className={fieldClass()}
                  value={box.action}
                  disabled={config.runtimeBoxesLive}
                  onChange={e => patchBox(idx, { action: e.target.value as PriceBox["action"] })}
                >
                  {ACTION_OPTS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[8px] text-black/35 uppercase mb-0.5">Amount %</label>
                <input
                  className={fieldClass()}
                  type="number"
                  step="1"
                  min={1}
                  max={100}
                  value={box.amountPercent ?? ""}
                  readOnly={config.runtimeBoxesLive}
                  onChange={e => patchBox(idx, { amountPercent: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => seedBoxesFromRisk()}
          className="w-full px-4 py-2.5 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333] transition-colors"
        >
          Re-seed boxes from risk profile
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onStatusChange(agentStatus === "running" ? "paused" : "running")}
            className="flex-1 py-2 rounded-lg border border-black/10 text-xs text-black/70 hover:bg-black/[0.03] transition-colors tracking-wide"
          >
            {agentStatus === "running" ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => {
              onStatusChange("paused")
              onBoxesChange(DEFAULT_RUNTIME_BOXES.map(b => ({ ...b })))
            }}
            className="flex-1 py-2 rounded-lg border border-black/10 text-xs text-black/70 hover:bg-black/[0.03] transition-colors tracking-wide"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="text-[9px] text-black/30 leading-relaxed border-t border-black/[0.06] pt-3">
        Status: <span className="text-black/50">{agentStatus}</span> · Config + boxes persist locally; safe to navigate away.
      </p>
    </aside>
  )
}

/** @deprecated import DEFAULT_RUNTIME_BOXES from @/lib/agents/agent-types */
export const DEFAULT_BOXES = DEFAULT_RUNTIME_BOXES
