"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AgentChartCanvas } from "@/components/dashboard/agent-chart-canvas";
import { AgentCapsulePanel } from "@/components/dashboard/agent-capsule-panel";
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed";
import { DashboardArenaBoard } from "@/components/dashboard/dashboard-arena-board";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { DashboardReplayControls } from "@/components/dashboard/dashboard-replay-controls";
import { ExpandedModule } from "@/components/dashboard/expandable-module";
import { legacySimulatorEthPnlToUsd } from "@/lib/dashboard/legacy-simulator-pnl";
import { useAgent, useAgentsStore } from "@/lib/agents/agents-store";
import { useAgentActivity } from "@/lib/agents/use-agent-activity";
import type { MetricsRange } from "@/lib/agents/metrics-types";
import { useAgentMetrics } from "@/lib/agents/use-agent-metrics";
import { useAgentTickWhileRunning } from "@/lib/agents/use-agent-tick-while-running";
import type { PriceBox } from "@/components/dashboard/types";
import type { AgentConfig } from "@/lib/agents/agent-types";
import {
  ARENA_POOL_BY_ID,
  ARENA_POOL_IDS,
  getTradableArenaPools,
  type ArenaPoolId,
} from "@/lib/agents/arena-pools";
import { useArenaLeaderboard } from "@/lib/arena/use-arena-leaderboard";
import { useAgentArenaFlash } from "@/lib/agents/use-agent-arena-flash";
import { useAgentWallet } from "@/lib/agents/use-agent-wallet";
import { chainIdFromSlug } from "@/lib/rombo/chain-config";
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

export function DashboardWorkspace({ agentId }: Props) {
  const agent = useAgent(agentId);
  const agentRunning = agent?.status === "running";
  const [metricsRange, setMetricsRange] = useState<MetricsRange>("all");
  const activityPollMs = agentRunning ? 3500 : 12_000;
  const { events: activity, reload: reloadActivity } = useAgentActivity(
    agentId,
    activityPollMs,
  );
  const { metrics: agentMetrics, loading: metricsLoading } = useAgentMetrics(
    agentId,
    metricsRange,
    { pollMs: agentRunning ? 4500 : 0 },
  );
  const { updateConfig, updateBoxes, setStatus, ready } = useAgentsStore();

  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (agentRunning && !wasRunningRef.current) void reloadActivity();
    wasRunningRef.current = agentRunning;
  }, [agentRunning, reloadActivity]);

  /** Local dev + open dashboard: drive server ticks (Vercel cron does not run in `next dev`). */
  useAgentTickWhileRunning(agentId, agentRunning);

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

  const winRateLegacy = useMemo(() => {
    const d = totals.fills + totals.skips;
    return d > 0 ? totals.fills / d : 0;
  }, [totals.fills, totals.skips]);

  const currentAgentName = config?.name ?? "arena-alpha";

  const livePoolId = overlayChartPoolId ?? committedChartPoolId;
  const arenaChainId = useMemo(
    () => chainIdFromSlug(config?.chain ?? "base-sepolia") ?? 84532,
    [config?.chain],
  );

  const { agents: arenaAgents, loading: arenaLeaderboardLoading } =
    useArenaLeaderboard({
      arenaPoolId: livePoolId,
      chainId: arenaChainId,
      highlightAgentId: agentId,
      limit: 20,
      refreshIntervalMs: agentRunning ? 6000 : 15_000,
    });

  const arenaFlash = useAgentArenaFlash(agentId, livePoolId);
  const { wallet: agentWallet } = useAgentWallet(agentId);

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

  const livePairTag =
    ARENA_POOL_BY_ID[livePoolId]?.livePairTag ?? "ETH / USDC";

  /** Single-pool hook drives the chart head; `/api/data/pools` fills the trio strip. */
  const livePriceHook = usePoolLivePrice(livePoolId, {
    intervalMs: agentRunning ? 4000 : 6000,
  });

  /** Hold last non-zero poll so the chart trail does not vanish on transient 503 / zero parses. */
  const lastGoodChartUsdRef = useRef<number | null>(null);
  useEffect(() => {
    const p = livePriceHook.price;
    if (p != null && p > 0) lastGoodChartUsdRef.current = p;
  }, [livePriceHook.price]);

  const chartLiveUsd =
    livePriceHook.price != null && livePriceHook.price > 0
      ? livePriceHook.price
      : lastGoodChartUsdRef.current;
  const candlesHook = usePoolCandles(committedChartPoolId, {
    granularity: "minute",
    limit: 120,
  });
  const overlayCandlesHook = usePoolCandles(overlayChartPoolId ?? null, {
    granularity: "minute",
    limit: 120,
  });
  const poolsListHook = usePoolsList(agentRunning ? 4000 : 8000);

  const basePoolActivity = useMemo(() => {
    const row = poolsListHook.data?.pools.find(
      (p) => p.arenaPoolId === committedChartPoolId,
    );
    if (!row) return null;
    return {
      volumeUsd24h: row.volumeUsd24h,
      feesUsd24h: row.feesUsd24h,
      totalValueLockedUsd: row.totalValueLockedUsd,
    };
  }, [poolsListHook.data?.pools, committedChartPoolId]);

  const overlayPoolActivity = useMemo(() => {
    if (!overlayChartPoolId) return null;
    const row = poolsListHook.data?.pools.find(
      (p) => p.arenaPoolId === overlayChartPoolId,
    );
    if (!row) return null;
    return {
      volumeUsd24h: row.volumeUsd24h,
      feesUsd24h: row.feesUsd24h,
      totalValueLockedUsd: row.totalValueLockedUsd,
    };
  }, [poolsListHook.data?.pools, overlayChartPoolId]);

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
    chartLiveUsd ??
    (livePriceHook.unavailable ? livePrice : livePrice);

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
              agentId={agentId}
              fundingWallet={agentWallet}
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
                  paused={!!overlayChartPoolId}
                  arenaPaused={agentStatus !== "running"}
                  onPriceUpdate={
                    overlayChartPoolId ? undefined : setLivePrice
                  }
                  serverArenaFlash={
                    overlayChartPoolId
                      ? null
                      : agentStatus === "running"
                        ? arenaFlash
                        : null
                  }
                  liveUsdPrice={
                    overlayChartPoolId ? null : chartLiveUsd
                  }
                  liveSeedUsdPrices={
                    overlayChartPoolId ? undefined : liveSeedCloses
                  }
                  poolActivity={basePoolActivity}
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
                    paused={false}
                    arenaPaused={agentStatus !== "running"}
                    onPriceUpdate={setLivePrice}
                    serverArenaFlash={
                      agentStatus === "running" ? arenaFlash : null
                    }
                    liveUsdPrice={chartLiveUsd}
                    liveSeedUsdPrices={overlaySeedCloses}
                    poolActivity={overlayPoolActivity}
                  />
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-30 flex justify-between items-start gap-3 pt-4 pl-4 pr-4 md:pt-5 md:pl-5 md:pr-5">
              <div className="pointer-events-auto max-w-[min(100%,340px)] rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
                <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">
                  Live · Spot price (USD)
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-black/38">
                  Mid / dock price from the trading pair (e.g. ETH/USDC ≈ $2,000+). Not TVL,
                  liquidity depth, or pool size.
                </p>
                <div className="mt-2 space-y-1.5">
                  {ARENA_POOL_IDS.map((poolKey) => {
                    const meta = ARENA_POOL_BY_ID[poolKey];
                    const row = poolsListHook.data?.pools.find(
                      (p) => p.arenaPoolId === poolKey,
                    );
                    const isChart = livePoolId === poolKey;
                    const usd = row?.displayUsd
                      ? Number(row.displayUsd)
                      : null;
                    const show =
                      usd !== null &&
                      Number.isFinite(usd) &&
                      usd > 0;
                    const dotClass =
                      (row?.source === "subgraph" || row?.source === "chainlink") &&
                      !row?.stale
                        ? "bg-emerald-500"
                        : row?.source === "stale"
                          ? "bg-amber-500"
                          : row?.source === "unavailable"
                            ? "bg-black/20"
                            : "bg-black/25";
                    return (
                      <div
                        key={poolKey}
                        className={`rounded-xl px-2 py-1.5 ${
                          isChart
                            ? "bg-emerald-500/[0.09] ring-1 ring-emerald-600/15"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`shrink-0 font-pixel text-[8px] tracking-[0.12em] uppercase ${
                              isChart ? "text-black/75" : "text-black/45"
                            }`}
                          >
                            {meta.livePairTag}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`truncate tabular-nums text-right ${
                                isChart
                                  ? "text-[17px] font-medium text-[#111]"
                                  : "text-[13px] text-black/70"
                              }`}
                              style={{
                                fontFamily: '"IBM Plex Sans", sans-serif',
                              }}
                            >
                              {show
                                ? formatArenaQuote(poolKey, usd)
                                : poolsListHook.loading && !poolsListHook.ready
                                  ? "…"
                                  : "—"}
                            </span>
                            <span
                              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${row ? dotClass : "bg-black/15"}`}
                              title={
                                row?.source === "unavailable"
                                  ? "No indexer data"
                                  : row?.source ?? ""
                              }
                            />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 border-t border-black/6 pt-2 font-pixel text-[8px] tracking-widest text-black/30 uppercase">
                  Chart spot · {livePairTag}{" "}
                  <span className="tabular-nums text-black/45 normal-case">
                    {formatArenaQuote(livePoolId, livePriceDisplayed)}
                  </span>
                </p>
              </div>

              <label className="pointer-events-auto flex items-center gap-2 rounded-xl border border-black/10 bg-white/95 backdrop-blur-md px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
                <span className="font-pixel text-[8px] tracking-[0.15em] text-black/40 uppercase whitespace-nowrap">
                  Arena pool
                </span>
                <select
                  className="max-w-[200px] bg-transparent text-[11px] text-[#111] font-medium border-none focus:outline-none focus:ring-0 cursor-pointer truncate"
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
                className="pointer-events-auto absolute bottom-6 left-5 z-30 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/92 backdrop-blur-md px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] text-[11px] tracking-[0.18em] uppercase text-black/70 hover:text-black hover:bg-white transition-colors"
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
                live={agentRunning}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-2 min-h-0">
              <DashboardMetrics
                range={metricsRange}
                onRangeChange={setMetricsRange}
                netPnlUsd={
                  agentMetrics?.netPnlUsd ??
                  legacySimulatorEthPnlToUsd(totals.pnlEth)
                }
                gasUsd={agentMetrics?.gasUsd}
                gasGweiLegacy={totals.gasGwei}
                actions={
                  agentMetrics?.actions ?? totals.fills + totals.skips
                }
                winRate={agentMetrics?.winRate ?? winRateLegacy}
                loading={metricsLoading}
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
                loading={arenaLeaderboardLoading}
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
          live={agentRunning}
        />
      </ExpandedModule>

      <ExpandedModule
        open={arenaExpanded}
        onClose={() => setArenaExpanded(false)}
        title="Arena leaderboard"
        subtitle={`30d · Mongo · ${arenaAgents.length} agents · ${config.pool}`}
      >
        <DashboardArenaBoard
          agents={arenaAgents}
          currentAgentName={currentAgentName}
          variant="lg"
          loading={arenaLeaderboardLoading}
        />
      </ExpandedModule>
    </div>
  );
}
