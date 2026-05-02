"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AgentChartCanvas } from "@/components/dashboard/agent-chart-canvas";
import { AgentCapsulePanel } from "@/components/dashboard/agent-capsule-panel";
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed";
import { DashboardArenaBoard } from "@/components/dashboard/dashboard-arena-board";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { DashboardReplayControls } from "@/components/dashboard/dashboard-replay-controls";
import { ExpandedModule } from "@/components/dashboard/expandable-module";
import { MOCK_ARENA_AGENTS } from "@/components/dashboard/mock-arena";
import { useAgent, useAgentsStore } from "@/lib/agents/agents-store";
import { useAgentActivity } from "@/lib/agents/use-agent-activity";
import type { PriceBox } from "@/components/dashboard/types";
import type { AgentConfig } from "@/lib/agents/agent-types";
import {
  ARENA_POOL_BY_ID,
  getTradableArenaPools,
  type ArenaPoolId,
} from "@/lib/agents/arena-pools";
import { usePoolCandles } from "@/lib/data/use-pool-candles";
import { usePoolLivePrice } from "@/lib/data/use-pool-live-price";
import { usePoolsList } from "@/lib/data/use-pools-list";

type Props = {
  agentId: string;
};

function formatArenaQuote(poolId: string, usd: number): string {
  if (poolId === "usdc-usdt") {
    return `$${usd.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    })}`;
  }
  if (poolId === "wbtc-eth") {
    return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUsdCompact(raw?: string): string {
  if (!raw) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function DashboardWorkspace({ agentId }: Props) {
  const agent = useAgent(agentId);
  const { events: activity } = useAgentActivity(agentId);
  const { updateConfig, updateBoxes, setStatus, ready } = useAgentsStore();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState(2306.94);
  const [committedChartPoolId, setCommittedChartPoolId] =
    useState<ArenaPoolId>("eth-usdc");
  const [overlayChartPoolId, setOverlayChartPoolId] =
    useState<ArenaPoolId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);

  const [logExpanded, setLogExpanded] = useState(false);
  const [arenaExpanded, setArenaExpanded] = useState(false);

  const handleConfigChange = useCallback(
    (patch: Partial<AgentConfig>) => {
      if (!agentId) return;
      updateConfig(agentId, patch);
    },
    [agentId, updateConfig],
  );

  const handleBoxesChange = useCallback(
    (next: PriceBox[]) => {
      if (!agentId) return;
      updateBoxes(agentId, next);
    },
    [agentId, updateBoxes],
  );

  const totals = agent?.totals ?? { pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 };
  const agentStatus = agent?.status ?? "paused";
  const config = agent?.config;
  const betAmount = agent?.config.betAmount ?? "0.10";

  const tradablePools = useMemo(
    () =>
      config
        ? getTradableArenaPools(config.tradeAllPools, config.enabledPoolIds)
        : [],
    [config],
  );

  useEffect(() => {
    const ids = tradablePools.map((p) => p.id);
    if (ids.length === 0) return;
    setCommittedChartPoolId((prev) =>
      ids.includes(prev) ? prev : ids[0]!,
    );
    setOverlayChartPoolId(null);
  }, [agentId, tradablePools]);

  const handleChartPoolSelect = useCallback(
    (next: ArenaPoolId) => {
      const ids = tradablePools.map((p) => p.id);
      if (!ids.includes(next)) return;
      if (next === committedChartPoolId && !overlayChartPoolId) return;
      if (next === committedChartPoolId && overlayChartPoolId) {
        setOverlayChartPoolId(null);
        return;
      }
      setOverlayChartPoolId(next);
    },
    [tradablePools, committedChartPoolId, overlayChartPoolId],
  );

  const completeChartSlide = useCallback(() => {
    setOverlayChartPoolId((cur) => {
      if (cur) setCommittedChartPoolId(cur);
      return null;
    });
  }, []);

  const winRate = useMemo(() => {
    const d = totals.fills + totals.skips;
    return d > 0 ? totals.fills / d : 0;
  }, [totals.fills, totals.skips]);

  const currentAgentName = config?.name ?? "arena-alpha";

  const arenaAgents = useMemo(() => {
    const scoreBump = Math.floor(totals.fills * 3 + totals.skips * 0.5);
    const alreadyInList = MOCK_ARENA_AGENTS.some(
      (a) => a.name === currentAgentName,
    );
    const base = MOCK_ARENA_AGENTS.map((a) =>
      a.name === currentAgentName
        ? {
            ...a,
            pnlEth: Number((a.pnlEth + totals.pnlEth * 0.42).toFixed(2)),
            score: a.score + scoreBump,
            winRate: totals.fills + totals.skips > 0 ? winRate : a.winRate,
            actions: a.actions + totals.fills + totals.skips,
          }
        : a,
    );
    if (alreadyInList) return base;
    // Insert the current (newly-created) agent alongside the demo roster.
    return [
      ...base,
      {
        id: agentId,
        name: currentAgentName,
        pool: config?.pool ?? "ETH / USDC · 0.05%",
        pnlEth: Number(totals.pnlEth.toFixed(2)),
        winRate,
        actions: totals.fills + totals.skips,
        score: 450 + scoreBump,
      },
    ];
  }, [
    totals.pnlEth,
    totals.fills,
    totals.skips,
    winRate,
    currentAgentName,
    config?.pool,
    agentId,
  ]);

  useEffect(() => {
    if (!replayPlaying || activity.length === 0) return;
    const tick = window.setInterval(() => {
      setReplayIndex((i) => {
        const cur = i ?? -1;
        if (cur >= activity.length - 1) {
          setReplayPlaying(false);
          return activity.length - 1;
        }
        return cur + 1;
      });
    }, 850);
    return () => window.clearInterval(tick);
  }, [replayPlaying, activity.length]);

  const highlightId =
    replayIndex !== null && replayIndex >= 0 && replayIndex < activity.length
      ? (activity[replayIndex]?.id ?? null)
      : null;

  const livePoolId = overlayChartPoolId ?? committedChartPoolId;
  const livePairTag =
    ARENA_POOL_BY_ID[livePoolId]?.livePairTag ?? "ETH / USDC";

  const livePriceHook = usePoolLivePrice(livePoolId, { intervalMs: 6000 });
  const candlesHook = usePoolCandles(committedChartPoolId, {
    granularity: "minute",
    limit: 120,
  });
  const overlayCandlesHook = usePoolCandles(overlayChartPoolId ?? null, {
    granularity: "minute",
    limit: 120,
  });
  const poolsListHook = usePoolsList(20_000);

  const liveSeedCloses = useMemo(() => {
    if (!candlesHook.ready || candlesHook.candles.length === 0) return undefined;
    const vals = candlesHook.candles
      .map((c) => Number(c.close))
      .filter((n) => Number.isFinite(n));
    return vals.length > 0 ? vals : undefined;
  }, [candlesHook.ready, candlesHook.candles]);

  const overlaySeedCloses = useMemo(() => {
    if (!overlayCandlesHook.ready || overlayCandlesHook.candles.length === 0) return undefined;
    const vals = overlayCandlesHook.candles
      .map((c) => Number(c.close))
      .filter((n) => Number.isFinite(n));
    return vals.length > 0 ? vals : undefined;
  }, [overlayCandlesHook.ready, overlayCandlesHook.candles]);

  const livePriceDisplayed =
    livePriceHook.price ?? (livePriceHook.unavailable ? livePrice : livePrice);
  const liveSourceLabel = livePriceHook.unavailable
    ? "sim"
    : livePriceHook.stale
      ? "stale"
      : livePriceHook.ready
        ? "subgraph"
        : "…";

  const livePoolListRow = useMemo(
    () => poolsListHook.data?.pools.find((p) => p.arenaPoolId === livePoolId) ?? null,
    [poolsListHook.data, livePoolId],
  );

  if (!ready) {
    return (
      <div className="py-12 text-center text-[12px] text-black/40">
        Loading agent…
      </div>
    );
  }

  if (!agent || !config) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-2xl border border-black/10 bg-white/80 px-6 py-8 text-center space-y-3">
        <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">
          Agent not found
        </p>
        <p className="text-[12px] text-black/50">
          This agent may have been deleted from another window, or the link is
          invalid.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#111] text-white text-[11px] tracking-widest font-medium hover:bg-[#333]"
        >
          ← All agents
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-6rem)] gap-3">
      <div className="flex flex-1 min-h-0 gap-4">
        <aside
          className={`relative shrink-0 transition-[width,opacity] duration-300 ease-out ${
            sidebarOpen
              ? "w-[320px] xl:w-[340px] opacity-100"
              : "w-0 opacity-0 pointer-events-none"
          }`}
          aria-hidden={!sidebarOpen}
        >
          <div className="h-full min-w-[320px] xl:min-w-[340px] relative max-h-[calc(100vh-7rem)] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Hide sidebar"
              className="absolute -right-3 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)] text-black/55 hover:text-black transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <AgentCapsulePanel
              config={config}
              onConfigChange={handleConfigChange}
              boxes={agent.boxes}
              onBoxesChange={handleBoxesChange}
              agentStatus={agentStatus}
              onStatusChange={(s) => setStatus(agentId, s)}
            />
          </div>
        </aside>

        <section className="flex flex-col flex-1 min-w-0 min-h-0 gap-3">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Fill flex row height like the original single canvas; grid keeps stacked pools same size */}
            <div className="grid min-h-[min(52vh,520px)] w-full flex-1 grid-cols-1 grid-rows-1">
              <div className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col">
                <AgentChartCanvas
                  key={`base-${committedChartPoolId}`}
                  poolId={committedChartPoolId}
                  selectedTargetId={selectedTargetId}
                  onSelectTarget={setSelectedTargetId}
                  betAmount={betAmount}
                  paused={
                    agentStatus !== "running" || !!overlayChartPoolId
                  }
                  onPriceUpdate={
                    overlayChartPoolId ? undefined : setLivePrice
                  }
                  liveUsdPrice={
                    overlayChartPoolId ? null : livePriceHook.price
                  }
                  liveSeedUsdPrices={
                    overlayChartPoolId ? undefined : liveSeedCloses
                  }
                />
              </div>
              {overlayChartPoolId && (
                <div
                  className="col-start-1 row-start-1 z-10 flex min-h-0 min-w-0 flex-col overflow-hidden bg-white dashboard-chart-slide-layer"
                  onAnimationEnd={(e) => {
                    if (e.target !== e.currentTarget) return;
                    completeChartSlide();
                  }}
                >
                  <AgentChartCanvas
                    key={`overlay-${overlayChartPoolId}`}
                    poolId={overlayChartPoolId}
                    selectedTargetId={selectedTargetId}
                    onSelectTarget={setSelectedTargetId}
                    betAmount={betAmount}
                    paused={agentStatus !== "running"}
                    onPriceUpdate={setLivePrice}
                    liveUsdPrice={livePriceHook.price}
                    liveSeedUsdPrices={overlaySeedCloses}
                  />
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-end gap-2 pt-4 pr-4 md:pt-5 md:pr-5">
              <div className="pointer-events-auto rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] min-w-[220px]">
                <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase flex items-center gap-1.5">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      liveSourceLabel === "subgraph"
                        ? "bg-emerald-500"
                        : liveSourceLabel === "stale"
                          ? "bg-amber-500"
                          : "bg-black/25"
                    }`}
                  />
                  Live · {livePairTag}
                </p>
                <p
                  className="mt-0.5 text-2xl leading-none tabular-nums text-[#111]"
                  style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
                >
                  {formatArenaQuote(livePoolId, livePriceDisplayed)}
                </p>
                <p className="mt-1 text-[9px] text-black/35 uppercase tracking-widest">
                  Source: {liveSourceLabel}
                </p>
                {livePoolListRow && (
                  <div className="mt-2 grid grid-cols-3 gap-1 border-t border-black/[0.06] pt-1.5">
                    <div>
                      <p className="font-pixel text-[7px] tracking-[0.18em] text-black/30 uppercase">TVL</p>
                      <p className="text-[10px] tabular-nums text-black/70">
                        {formatUsdCompact(livePoolListRow.totalValueLockedUsd)}
                      </p>
                    </div>
                    <div>
                      <p className="font-pixel text-[7px] tracking-[0.18em] text-black/30 uppercase">24h Vol</p>
                      <p className="text-[10px] tabular-nums text-black/70">
                        {formatUsdCompact(livePoolListRow.volumeUsd24h)}
                      </p>
                    </div>
                    <div>
                      <p className="font-pixel text-[7px] tracking-[0.18em] text-black/30 uppercase">24h Fees</p>
                      <p className="text-[10px] tabular-nums text-black/70">
                        {formatUsdCompact(livePoolListRow.feesUsd24h)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <label className="pointer-events-auto flex items-center gap-2 rounded-xl border border-black/10 bg-white/95 backdrop-blur-md px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
                <span className="font-pixel text-[8px] tracking-[0.15em] text-black/40 uppercase whitespace-nowrap">
                  Arena pool
                </span>
                <select
                  className="max-w-[220px] bg-transparent text-[11px] text-[#111] font-medium border-none focus:outline-none focus:ring-0 cursor-pointer truncate"
                  value={overlayChartPoolId ?? committedChartPoolId}
                  onChange={(e) =>
                    handleChartPoolSelect(e.target.value as ArenaPoolId)
                  }
                  aria-label="Select arena pool chart"
                >
                  {tradablePools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show sidebar"
                className="pointer-events-auto absolute top-5 left-5 z-30 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] text-[11px] tracking-[0.18em] uppercase text-black/70 hover:text-black hover:bg-white transition-colors"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className="font-pixel">Panel</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0 min-h-[220px] max-h-[340px] lg:max-h-[360px]">
            <div className="lg:col-span-5 min-h-[180px] lg:min-h-0">
              <DashboardActivityFeed
                events={activity}
                highlightId={highlightId}
                onExpand={() => setLogExpanded(true)}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-2 min-h-0">
              <DashboardMetrics
                pnlEth={totals.pnlEth}
                gasGweiTotal={totals.gasGwei}
                actions={totals.fills + totals.skips}
                winRate={winRate}
              />
              <DashboardReplayControls
                events={activity}
                replayIndex={replayIndex}
                replayPlaying={replayPlaying}
                onPlay={() => {
                  if (activity.length === 0) return;
                  setReplayPlaying(true);
                  setReplayIndex((i) => (i === null || i < 0 ? 0 : i));
                }}
                onPause={() => setReplayPlaying(false)}
                onStepPrev={() => {
                  setReplayPlaying(false);
                  setReplayIndex((i) => {
                    const cur = i ?? 0;
                    return Math.max(0, cur - 1);
                  });
                }}
                onStepNext={() => {
                  setReplayPlaying(false);
                  setReplayIndex((i) => {
                    const cur = i ?? -1;
                    return Math.min(activity.length - 1, cur + 1);
                  });
                }}
                onCloseReplay={() => {
                  setReplayPlaying(false);
                  setReplayIndex(null);
                }}
              />
            </div>
            <div className="lg:col-span-3 min-h-[180px] lg:min-h-0">
              <DashboardArenaBoard
                agents={arenaAgents}
                currentAgentName={currentAgentName}
                onExpand={() => setArenaExpanded(true)}
              />
            </div>
          </div>
        </section>
      </div>

      <ExpandedModule
        open={logExpanded}
        onClose={() => setLogExpanded(false)}
        title="Execution log"
        subtitle={`${activity.length} events · ${config.name}`}
      >
        <DashboardActivityFeed
          events={activity}
          highlightId={highlightId}
          variant="lg"
        />
      </ExpandedModule>

      <ExpandedModule
        open={arenaExpanded}
        onClose={() => setArenaExpanded(false)}
        title="Arena leaderboard"
        subtitle={`Ranked across ${arenaAgents.length} agents · ${config.pool}`}
      >
        <DashboardArenaBoard
          agents={arenaAgents}
          currentAgentName={currentAgentName}
          variant="lg"
        />
      </ExpandedModule>
    </div>
  );
}
