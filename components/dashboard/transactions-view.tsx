"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { AgentActivityEvent, ExecutionKind } from "@/components/dashboard/activity-types"
import { formatPnlUsdc } from "@/components/dashboard/pnl-usdc"
import { useAgentsStore } from "@/lib/agents/agents-store"
import type { Agent } from "@/lib/agents/agent-types"

type TxRow = AgentActivityEvent & {
  agentId: string
  agentName: string
}

const KIND_LABELS: Record<ExecutionKind, string> = {
  swap: "Swap",
  add_liquidity: "Add LP",
  remove_liquidity: "Remove LP",
  claim_fees: "Claim fees",
  close_position: "Close",
  box_skipped: "Skipped",
}

const TIME_OPTIONS = [
  { id: "all" as const, label: "Any time" },
  { id: "24h" as const, label: "Last 24h" },
  { id: "7d" as const, label: "Last 7d" },
  { id: "30d" as const, label: "Last 30d" },
]

function fallbackReason(ev: AgentActivityEvent): string {
  if (ev.reason) return ev.reason
  if (ev.kind === "box_skipped") return "No fill: band cleared before route completion."
  return "Legacy event — rationale inferred from execution type until backend receipts ship."
}

function formatWhen(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function withinPreset(ts: number, preset: (typeof TIME_OPTIONS)[number]["id"], now: number): boolean {
  if (preset === "all") return true
  const ms =
    preset === "24h" ? 86400000 : preset === "7d" ? 86400000 * 7 : 86400000 * 30
  return now - ts <= ms
}

export function TransactionsView() {
  const { agents, ready } = useAgentsStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const agentFromUrl = searchParams.get("agent")

  const [tabAgentId, setTabAgentId] = useState<string>("all")
  const [timePreset, setTimePreset] = useState<(typeof TIME_OPTIONS)[number]["id"]>("all")
  const [kindFilter, setKindFilter] = useState<ExecutionKind | "all">("all")
  const [outcome, setOutcome] = useState<"all" | "filled" | "skipped">("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!ready || agents.length === 0) return
    if (agentFromUrl && agents.some((a) => a.id === agentFromUrl)) {
      setTabAgentId(agentFromUrl)
    }
  }, [ready, agents, agentFromUrl])

  const setTab = useCallback(
    (id: string) => {
      setTabAgentId(id)
      const params = new URLSearchParams(searchParams.toString())
      if (id === "all") {
        params.delete("agent")
      } else {
        params.set("agent", id)
      }
      const q = params.toString()
      router.replace(`/dashboard/transactions${q ? `?${q}` : ""}`, { scroll: false })
    },
    [router, searchParams],
  )

  const rows = useMemo(() => {
    const now = Date.now()
    const scope: Agent[] =
      tabAgentId === "all" ? agents : agents.filter((a) => a.id === tabAgentId)

    let list: TxRow[] = scope.flatMap((a) =>
      a.activity.map((ev) => ({
        ...ev,
        agentId: a.id,
        agentName: a.config.name,
      })),
    )

    list = list
      .filter((r) => withinPreset(r.at, timePreset, now))
      .filter((r) => (kindFilter === "all" ? true : r.kind === kindFilter))
      .filter((r) => {
        if (outcome === "all") return true
        if (outcome === "skipped") return r.kind === "box_skipped"
        return r.kind !== "box_skipped"
      })

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const blob = `${r.title} ${r.detail} ${fallbackReason(r)} ${r.agentName} ${KIND_LABELS[r.kind]}`.toLowerCase()
        return blob.includes(q)
      })
    }

    list.sort((a, b) => b.at - a.at)
    return list
  }, [agents, tabAgentId, timePreset, kindFilter, outcome, search])

  if (!ready) {
    return (
      <div className="py-16 text-center text-[13px] text-black/40">Loading transactions…</div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-12 space-y-6">
      <header className="space-y-1 pt-2">
        <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Ledger</p>
        <h1
          className="text-xl font-light text-[#111] tracking-tight"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          Transactions
        </h1>
        <p className="text-[12px] text-black/45 max-w-xl leading-relaxed">
          Simulated execution lines from your agents (same data as the arena chart). Filter by time, outcome, and type.
          When onchain APIs ship, hashes will resolve to Base explorers.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-black/[0.06] pb-3">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-3 py-1.5 rounded-lg text-[11px] tracking-wide transition-colors ${
            tabAgentId === "all"
              ? "bg-[#111] text-white"
              : "border border-black/10 text-black/55 hover:bg-black/[0.03]"
          }`}
        >
          All agents
        </button>
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setTab(a.id)}
            className={`max-w-[200px] truncate px-3 py-1.5 rounded-lg text-[11px] tracking-wide transition-colors ${
              tabAgentId === a.id
                ? "bg-[#111] text-white"
                : "border border-black/10 text-black/55 hover:bg-black/[0.03]"
            }`}
          >
            {a.config.name}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-black/[0.07] bg-white/90 p-4 space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1">
            <span className="text-[9px] tracking-widest text-black/35 uppercase">When</span>
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#111]"
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value as (typeof TIME_OPTIONS)[number]["id"])}
            >
              {TIME_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] tracking-widest text-black/35 uppercase">Type</span>
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#111]"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as ExecutionKind | "all")}
            >
              <option value="all">All types</option>
              {(Object.keys(KIND_LABELS) as ExecutionKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] tracking-widest text-black/35 uppercase">Outcome</span>
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#111]"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="all">All outcomes</option>
              <option value="filled">Filled / executed</option>
              <option value="skipped">Skipped / missed</option>
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2 lg:col-span-1">
            <span className="text-[9px] tracking-widest text-black/35 uppercase">Search</span>
            <input
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#111] placeholder:text-black/25"
              placeholder="Title, detail, why…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <p className="text-[11px] text-black/40">
          Showing <span className="font-medium text-black/60">{rows.length}</span>{" "}
          {rows.length === 1 ? "row" : "rows"}
        </p>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-[#fafaf8]/80 px-6 py-12 text-center text-[13px] text-black/45">
            No transactions match these filters. Try widening the time window or clearing search.
          </div>
        ) : (
          rows.map((r) => (
            <article
              key={`${r.agentId}-${r.id}`}
              className="rounded-2xl border border-black/[0.06] bg-white/95 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.04)] space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-black/[0.06] px-2 py-0.5 font-pixel text-[8px] tracking-widest text-black/50 uppercase">
                      {KIND_LABELS[r.kind]}
                    </span>
                    {tabAgentId === "all" && (
                      <Link
                        href={`/dashboard/transactions?agent=${r.agentId}`}
                        className="text-[11px] font-medium text-emerald-800/90 hover:underline truncate max-w-[200px]"
                      >
                        {r.agentName}
                      </Link>
                    )}
                  </div>
                  <h2 className="text-[14px] font-medium text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
                    {r.title}
                  </h2>
                  <p className="text-[12px] text-black/55 leading-snug">{r.detail}</p>
                </div>
                <time className="shrink-0 text-[11px] tabular-nums text-black/40">{formatWhen(r.at)}</time>
              </div>

              <div className="rounded-xl bg-[#fafaf8]/90 border border-black/[0.05] px-3 py-2.5">
                <p className="text-[9px] tracking-widest text-black/35 uppercase mb-1">Why</p>
                <p className="text-[12px] text-black/65 leading-relaxed">{fallbackReason(r)}</p>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-black/45">
                {r.pnlEth !== undefined && (
                  <span>
                    Est. PnL{" "}
                    <span className={`tabular-nums font-medium ${r.pnlEth >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {formatPnlUsdc(r.pnlEth)}
                    </span>
                  </span>
                )}
                {r.gasGwei !== undefined && (
                  <span>
                    Gas <span className="tabular-nums text-black/55">{r.gasGwei.toFixed(0)} gwei</span>
                  </span>
                )}
                {r.txShort && (
                  <span className="font-mono text-[10px] text-black/35" title="Placeholder until Base explorer link">
                    {r.txShort}
                  </span>
                )}
                <Link
                  href={`/dashboard/agents/${r.agentId}`}
                  className="text-[11px] text-black/40 hover:text-black underline-offset-2 hover:underline"
                >
                  Open agent workspace
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
