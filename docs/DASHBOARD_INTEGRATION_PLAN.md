# Rombo — Dashboard ↔ Backend integration plan

> **Goal.** Remove **every** simulated / dummy / stale value from the dashboard. Price feeds, execution log, PnL, gas, actions, win rate, arena leaderboard, and agent runtime must be driven by **real Uniswap API calls**, **real on‑chain receipts**, and **real subgraph / oracle data** — persisted in **MongoDB** and fetched via typed APIs.

Cross‑refs: **[`docs/BACKEND_API_ROADMAP.md`](./BACKEND_API_ROADMAP.md)** · **[`docs/UNISWAP_API_REFERENCE.md`](./UNISWAP_API_REFERENCE.md)** · **[`docs/PRIVY_SETUP.md`](./PRIVY_SETUP.md)**.

---

## 0. Working rule — build = ship (no detached backend)

**Every backend change is integrated into the frontend in the same PR / commit it ships in.** No "backend now, wire UI later". A phase is only considered done when both sides are live.

Definition of Done for every phase below:

1. Backend module(s) implemented + typed.
2. API route(s) added + smoke‑tested (curl / `fetch` in dev).
3. Frontend hook / component migrated to the new endpoint in the **same** change set.
4. The dummy / mock / simulated code path it replaces is **deleted** (or hidden behind a feature flag that defaults to `off`).
5. Dashboard looks correct end‑to‑end against a real session with `npm run dev`.
6. `docs/DASHBOARD_INTEGRATION_PLAN.md` TODO boxes for that slice are ticked.

Practical consequences:

- When adding a GET route, also add the hook that calls it and at least one UI surface that renders it, in the same commit.
- When adding a POST / mutation route, also wire the button or form that triggers it.
- When deleting a dummy module, also delete its imports and any "fallback to sim" branches.
- A slice can be as small as "one endpoint + one card on the dashboard" — smaller slices are preferred over big backend‑only drops.

---

## 1. Current state — what is still synthetic

| Surface                                  | File(s)                                                              | Source today                                              | Replace with                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Live price badge on chart                | `components/dashboard/agent-chart-canvas.tsx` · `getPoolChartSim()`  | Deterministic sine + jitter                               | Subgraph spot (token price) + on‑chain Quoter fallback                                             |
| Arena chart candles / path               | `agent-chart-canvas.tsx`                                             | Pure random walk                                          | `poolHourDatas` / `poolMinuteDatas` subgraph + live tick                                           |
| Arena resolutions (`hit/mult/payoutEth`) | `agent-chart-canvas.tsx`                                             | Row / column RNG                                          | Derived from **real** swap / LP outcomes at tick time                                              |
| Execution log entries                    | `lib/agents/activity-join.ts` · `GET /api/agents/[agentId]/activity` | Was synthetic (`synthesize-activity`, removed)            | `agent_runs` + receipt enrich + swap audit excerpts                                                |
| Per‑agent metrics card                   | `components/dashboard/dashboard-metrics.tsx`                         | `agent.totals` (sim)                                      | `GET /api/agents/[agentId]/metrics`                                                                |
| Agent card (grid) stats                  | `components/dashboard/agent-card.tsx`                                | Same `totals`                                             | Same metrics endpoint (batched)                                                                    |
| Overview KPI plates                      | `components/dashboard/overview-metrics.tsx`                          | `GET /api/dashboard/overview` **but** fed by sim `totals` | Real runtime will now write real `totals`                                                          |
| Arena leaderboard                        | `useArenaLeaderboard` · `arena_leaderboard_cache`                    | Mongo + cron                                              | `GET /api/arena/leaderboard?arenaPoolId=`                                                          |
| Transactions view                        | `components/dashboard/transactions-view.tsx`                         | **Half‑real**: receipts live, simulator rows still there  | Drop simulator rows once runtime ships                                                             |
| Agent runtime (decisions)                | `lib/agents/agents-store.tsx` background tick                        | Client `setInterval` simulating hits                      | Server‑side tick → Uniswap API → Privy signing                                                     |
| Config guardrails enforcement            | `agent-types.ts` (UI only)                                           | Not enforced anywhere                                     | Runtime validates each action against `maxPositionPercent`, `slippage`, `gasCap`, `approvedTokens` |

---

## 2. Canonical data ownership

**Server (Mongo is source of truth):**

- `users`, `agents`, `agent_wallets`, `trading_attempts`, `onchain_receipts`, `wallet_chain_nonces`, `lp_positions`, `indexed_pool_snapshots`, `indexer_webhook_deliveries`.

**New collections (Phase 2 – 6):**

| Collection                | Purpose                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pool_prices`             | Short‑retention cache of live spot (per `arenaPoolId` + `chainId`).                                        |
| `pool_candles`            | 1m / 5m / 1h OHLC derived from subgraph (or `poolMinuteDatas`).                                            |
| `agent_runs`              | One row per tick: inputs, decision, outcome, references to `trading_attempts._id`, `onchain_receipts._id`. |
| `agent_metrics`           | Rolling aggregates recomputed after each finalized run (avoids scanning receipts on every API hit).        |
| `arena_leaderboard_cache` | Materialised leaderboard rows per `arenaPoolId`.                                                           |

**Client:** pure display + optimistic mutations for config edits. No simulation once runtime ships.

---

## 3. Implementation phases

Each phase produces **backend code + API + frontend wiring** and deletes / replaces the dummy code path(s) it supersedes.

### Phase 1 — Live pool data for the three arena pools

Three supported pools: `eth-usdc`, `wbtc-eth`, `usdc-usdt` on the active `ROMBO_TARGET_NETWORK` (Base Sepolia / Base mainnet). Token + fee addresses already in `lib/trading/arena-pool-onchain.ts`.

**Backend**

- `lib/integrations/uniswap/subgraph.ts`
  - Add `fetchV3PoolPriceByAddress(poolAddress)` → returns `{ token0Price, token1Price, tick, sqrtPriceX96, updatedAt }`.
  - Add `fetchV3PoolCandles({ poolAddress, granularity: "hour"|"minute", limit })` → OHLC rows.
- `lib/oracles/chainlink.ts` _(new)_
  - `getEthUsdRef(chainId)` via Chainlink feeds (Base `ETH/USD` + `BTC/USD`) for USD normalisation of `wbtc-eth` and `eth-usdc` quotes. Fallback to subgraph token prices.
- `lib/data/pool-prices.repo.ts` _(new)_
  - Upsert `pool_prices` snapshot with TTL index (e.g. keep 24h, 15s resolution).
- `lib/data/live-pool-tick.ts` _(new)_
  - Runs every 10–15s per pool via cron route.
  - Primary: subgraph. Fallback: Uniswap **QuoterV2** via a public RPC (`eth_call`).

**APIs**

| Method | Route                                                                | Purpose                                                          |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/data/pools`                                                    | List three arena pools with latest price + TVL + 24h vol + fees. |
| GET    | `/api/data/pools/[arenaPoolId]/price`                                | Latest USD‑normalised spot + raw ticks.                          |
| GET    | `/api/data/pools/[arenaPoolId]/candles?granularity=minute&limit=120` | OHLC for chart.                                                  |
| GET    | `/api/data/pools/[arenaPoolId]/stats`                                | TVL / volume / fees snapshot.                                    |
| GET    | `/api/cron/poll-pools`                                               | Vercel cron hit; refreshes `pool_prices` + `pool_candles`.       |

**Frontend**

- New hook `lib/agents/use-pool-live-price.ts`:
  - Polls `/api/data/pools/[id]/price` every 5s when tab visible.
  - Returns `{ price, updatedAt, source: "subgraph" | "quoter" | "stale" }`.
- `AgentChartCanvas`:
  - Replace `getPoolChartSim(poolId)` path.
  - Historical series seeded from `/candles`, live tail pushed from `/price`.
  - Keep arena grid visuals, drive "price arrow" from real ticks.
- `dashboard-workspace.tsx` live badge: value from the hook, subtitle `"Live · subgraph"` or `"Live · QuoterV2"`.
- **Remove** `getPoolChartSim` once all callers are migrated.

**TODO**

- [x] Add subgraph pool helpers (price + candles) → `lib/integrations/uniswap/subgraph.ts` (`fetchV3PoolSpotByAddress`, `fetchV3PoolSpotByPair`, `fetchV3PoolCandles`).
- [ ] Chainlink oracle helper for Base + Base Sepolia (fallback rules) — _deferred to Phase 2; ETH/USD is already derived from the subgraph `bundle.ethPriceUSD`._
- [x] `pool_prices` / `pool_candles` collections + TTL indices → `lib/data/pool-prices.repo.ts`, `lib/data/pool-candles.repo.ts`.
- [x] `/api/data/pools/*` routes → `app/api/data/pools/route.ts`, `.../[arenaPoolId]/price`, `/candles`, `/stats`.
- [x] `GET /api/cron/poll-pools` + `vercel.json` schedule → `app/api/cron/poll-pools/route.ts`, `vercel.json`. Cron auth gated by `ROMBO_CRON_SECRET`.
- [x] `usePoolLivePrice` hook → `lib/data/use-pool-live-price.ts` (+ `use-pool-candles.ts`, `use-pools-list.ts`).
- [x] Wire chart canvas — `AgentChartCanvas` now accepts `liveUsdPrice` + `liveSeedUsdPrices`; `DashboardWorkspace` feeds live price, candles seed, pool stats strip and a `Live · {subgraph|stale|sim}` source chip. `getPoolChartSim` is retained as fallback when `UNISWAP_V3_SUBGRAPH_URL` is unset; will be deleted in Phase 8.

---

### Phase 2 — Agent runtime (autonomous, server‑side)

Goal: agents decide + execute on‑chain **without client sim**. Client becomes a view layer.

**Backend**

- `lib/agents/runtime/evaluate-boxes.ts` _(new)_
  - Given current `price`, `PriceBox[]`, `AgentConfig`, return one of:
    `{ type: "skip", reason }` · `{ type: "swap", ... }` · `{ type: "lp_increase", ... }` · `{ type: "lp_decrease", ... }`.
  - Enforces `maxPositionPercent`, `slippage`, `gasCap`, `approvedTokens`, `enabledPoolIds`.
- `lib/agents/runtime/execute-decision.ts` _(new)_
  - Swap path: `uniswapCheckApproval` → `uniswapQuote` → `uniswapCreateSwap` → **sign via Privy agent wallet** (`signEthereumPersonalMessageWithAuthorizationKey` extended to `signTransaction`) → broadcast through Privy.
  - LP path: `uniswapLpCheckApproval` → `uniswapLpCreate|increase|decrease|claim` → sign + broadcast.
  - Writes `trading_attempts` (already used) + records `broadcastNonce`.
  - Returns the `txHash` + metadata for the receipt poller.
- `lib/agents/runtime/tick.ts` _(new)_
  - Orchestrates: fetch live price(s), loop `enabledPoolIds`, evaluate → execute → append `agent_runs` row.
  - Guard: skip if `agent.status !== "running"` or agent wallet missing.
- `lib/integrations/privy/wallet-signing.ts`
  - Add `signAndBroadcastEthereumTransaction({ walletId, unsignedTx, chainId })` covering `sendTransaction`. This replaces "return calldata for user to sign" in the runtime path.
- Receipt poller (worker / cron):
  - `lib/indexer/poll-receipt.ts` becomes a real implementation that consumes pending `txHash`es (from `trading_attempts` where `status=ok && receipt=null`) and calls `eth_getTransactionReceipt` via RPC, then `applyReceiptEvent(..., "poll")`.

**APIs**

| Method | Route                               | Purpose                                                          |
| ------ | ----------------------------------- | ---------------------------------------------------------------- |
| POST   | `/api/agents/[agentId]/tick`        | Internal — run one tick for an agent (protected by cron secret). |
| POST   | `/api/cron/agents-tick`             | Vercel cron — iterates **all running** agents.                   |
| POST   | `/api/cron/poll-receipts`           | Poll unresolved txs and call `applyReceiptEvent`.                |
| GET    | `/api/agents/[agentId]/runs?limit=` | Audit log of runtime decisions (success / skip / error).         |

**Frontend**

- Delete the background `setInterval` in `lib/agents/agents-store.tsx` (no more client sim). `runtimeBoxesLive` toggle stays but only previews drift visually — it no longer fabricates `activity` or `totals`.
- Replace `recordResolution()` flow from the chart canvas: the canvas emits **price samples** only; resolutions come from `agent_runs` via the new execution log stream.

**TODO**

- [x] `evaluate-boxes.ts` (+ chart-coord helper); LP execution still deferred (logged as skip).
- [x] `execute-decision.ts` swap path (+ Privy typed-data sign + broadcast); LP automated actions deferred.
- [x] Privy `signEthereumTypedDataV4` + `signAndBroadcastEthereumTransaction`.
- [x] `agent_runs` collection + repo (`lib/db/agent-runs.repo.ts`).
- [x] `POST/GET /api/agents/[agentId]/tick` (cron secret auth) + `GET /api/agents/[agentId]/runs`.
- [x] `/api/cron/agents-tick` + `/api/cron/poll-receipts` + `vercel.json` schedules.
- [x] Remove client simulator loop + chart‑driven `recordResolution`; `runtimeBoxesLive` drift only.

---

### Phase 3 — Execution log from real data

**Backend**

- `lib/agents/activity-join.ts` _(new)_
  - Joins `trading_attempts` + `onchain_receipts` (by `txHash`) + `agent_runs` (by `idempotencyKey`) → `AgentActivityEvent` rows compatible with `components/dashboard/activity-types.ts`.
  - Populates:
    - `kind`: from `TradingAttemptKind` → `ExecutionKind` (`swap` / `add_liquidity` / `remove_liquidity` / `claim_fees` / `close_position` / `box_skipped`).
    - `title`: canonical string ("Swap executed", etc.).
    - `detail`: token pair, amounts, routing from stored quote.
    - `reason`: runtime decision reason or error code.
    - `pnlEth`: from the realized swap (Phase 4 once oracles plug in).
    - `gasGwei`: `effectiveGasPrice` (wei → gwei) × 1 (already per‑tx).
    - `txShort` + full `txHash`, `chainId`, `blockNumber`.
- Optional: `ExecutionKind` gains `"error"` so failed swaps show distinctly.

**APIs**

| Method | Route                                           | Purpose                                                                               |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/agents/[agentId]/activity?limit=&cursor=` | Real, paginated activity for this agent.                                              |
| GET    | `/api/dashboard/transactions` (existing)        | Returns `receipts` + `activityEvents` (from `agent_runs` join); no synthetic payload. |

**Frontend**

- New hook `lib/agents/use-agent-activity.ts`.
- `dashboard-workspace.tsx`:
  - `DashboardActivityFeed` takes `events` from the hook, not `agent.activity`.
  - Replay controls act on real events.
- `transactions-view.tsx`:
  - Remove `syntheticRows` — only `onchain` rows now.
  - Add explorer link column (e.g. `basescan.org/tx/...` when `chainId ∈ {8453, 84532}`).
- ~~Delete `components/dashboard/synthesize-activity.ts`~~ _(done)_.

**TODO**

- [x] Activity join helper (`lib/agents/activity-join.ts`) — primary source `agent_runs`; enrich via receipts + swap `trading_attempts`; LP/claim kinds appear when runtime emits them.
- [x] `GET /api/agents/[agentId]/activity?limit=&cursor=`.
- [x] Explorer URL helper `lib/onchain/explorer.ts` (Base / Base Sepolia).
- [x] `use-agent-activity.ts`, workspace feed + replay, transactions view + ledger merge + explorer links.
- [x] Deleted `synthesize-activity.ts`. Legacy `agent.activity` may still exist in Mongo/local storage until a later cleanup pass.

---

### Phase 4 — Real metrics (PnL / gas / actions / win rate)

**Definitions (commit these to code):**

- **Actions** = count of executed Uniswap API calls (swap, lp_create/increase/decrease/claim) with `status = ok`.
- **Fills** = actions whose receipt `status = success`.
- **Skips** = evaluator returned `skip` **or** `trading_attempts.status = error` **or** receipt `status = reverted`.
- **Gas** = Σ `receipt.gasUsed × receipt.effectiveGasPrice` over the period (wei → gwei for display, or USD via oracle).
- **PnL** (v1): realised **swap PnL** = Σ(`amountOut × priceOut` − `amountIn × priceIn` − `gasUsd`) using Chainlink refs at tx time.
- **PnL** (v2, LP): add `fees_claimed_usd` (from LP claim logs) and mark‑to‑market of open positions via pool spot.
- **Win rate** = `fills / (fills + skips)` (same formula as today, but over real events).

**Backend**

- `lib/agents/metrics.ts`
  - `computeAgentMetrics` — fresh scan of receipts + attempts (definitions in file header).
  - `agent_metrics` rollups (`lib/db/agent-metrics.repo.ts`) refreshed after each agent tick; APIs read-through cache (~5 min TTL) then merge.
- `lib/onchain/pricing-at.ts`
  - `getEthUsdSpot` for gas USD; `getRefPriceAtTime` stub (spot) until Chainlink / candle historical wiring.

**APIs**

| Method | Route                                    | Purpose                                                              |
| ------ | ---------------------------------------- | -------------------------------------------------------------------- | ---- | ------------------------------- |
| GET    | `/api/agents/[agentId]/metrics?range=24h | 7d                                                                   | all` | Real PnL / gas / actions / win. |
| GET    | `/api/agents/metrics?ids=a,b,c`          | Batched for the agent grid.                                          |
| GET    | `/api/dashboard/overview`                | Same shape; aggregates from `agent_metrics` when fresh else compute. |

**Frontend**

- New hook `use-agent-metrics(agentId, range)`.
- `dashboard-metrics.tsx`:
  - Card labels stay, values come from hook; add `range` selector.
  - Remove `"simulated · USDC"` subtitle.
- `agent-card.tsx`: batched metrics via `/api/agents/metrics?ids=…`.
- `overview-metrics.tsx`: unchanged API, labels drop "simulated".
- `pnl-usdc.ts`: USD-first formatters; legacy simulator conversion lives in `lib/dashboard/legacy-simulator-pnl.ts`.

**TODO**

- [x] Finalise PnL v1 formula + fixture tests (parsed swap amounts + `getRefPriceAtTime`). See `lib/agents/swap-pnl-v1.ts`, `swap-quote-amounts.ts`, `npm run test:metrics`.
- [x] Historical price helper stub (`getRefPriceAtTime` → spot; extend with Chainlink / candles).
- [x] `agent_metrics` collection + repo + rollup after each tick (`refreshAgentMetricsRollupsForAgent`).
- [x] `/api/agents/[agentId]/metrics` + batch variant + overview aggregates.
- [x] `DashboardMetrics` / `AgentCard` via `use-agent-metrics` + batch hook.
- [x] Client win rate for KPIs comes from API metrics (no `applyEventToTotals` in codebase).

---

### Phase 5 — Arena leaderboard (real)

**Backend**

- `lib/arena/leaderboard.ts` _(new)_
  - Aggregates per‑pool top agents: rank by `score = 0.6 × pnlUsdNormalised + 0.3 × winRate × 100 + 0.1 × log(1 + actions)`.
  - Scoped to `arenaPoolId` + chain + last 30 days by default.
- `arena_leaderboard_cache` collection + recompute job every 1 – 5 min via cron.

**APIs**

| Method     | Route                                                            | Purpose                                   |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------- |
| GET        | `/api/arena/leaderboard?arenaPoolId=eth-usdc&range=30d&limit=20` | Ranked list of agents for the pool.       |
| GET        | `/api/arena/my-rank?agentId=`                                    | Current agent's rank + neighbours (auth). |
| GET / POST | `/api/cron/arena-rebuild`                                        | Rebuilds cache (cron uses GET).           |

**Frontend**

- New hook `use-arena-leaderboard(poolId)`.
- `dashboard-arena-board.tsx`: consume hook.
- ~~Delete `components/dashboard/mock-arena.ts`~~ _(done)_.
- `dashboard-workspace.tsx`: drop the "merge mock with your agent" block; `arenaAgents` comes from the hook and already places the current agent correctly.

**TODO**

- [x] Leaderboard aggregator (`lib/arena/leaderboard.ts`). Opt‑in / public flag deferred until agent schema exposes it.
- [x] Cache (`arena_leaderboard_cache`) + Vercel cron `*/3 * * * *` → `/api/cron/arena-rebuild`.
- [x] `/api/arena/leaderboard`, `/api/arena/my-rank`, cron route.
- [x] `use-arena-leaderboard.ts`; `dashboard-workspace.tsx` wired; `mock-arena.ts` removed.

---

### Phase 6 — Chart arena "resolution" from real events

Once Phase 2–4 land, the visual arena stops simulating hits.

**Backend**

- Reuse `agent_runs`: each row carries `{ decisionAt, outcome: hit|skip|error, mult, payoutUsd }`.
  - `mult` is derived from realised return vs bet (or preserved from the selected grid row when an explicit bet is on).
- Streaming:
  - v1: polling `/api/agents/[agentId]/runs?since=…` every 2–3s from the chart.
  - v2: SSE `/api/agents/[agentId]/stream` pushing new runs as they land.

**Frontend**

- `agent-chart-canvas.tsx` emits `onArenaResolution` **only** when a new `agent_run` comes in from the stream — not from its internal grid scroll.
- Visual effect (fireworks / EXECUTED overlay) fires on server confirmations.

**TODO**

- [x] Runs endpoint (`GET …/runs?since=`) + SSE (`GET …/stream`).
- [x] Chart: `useAgentArenaFlash` polls runs; `AgentChartCanvas` uses `serverArenaFlash` only (no grid RNG callback).

---

### Phase 7 — Agent config & guardrails, server‑enforced

**Backend**

- `lib/agents/runtime/validate-config.ts`
  - Schema via Zod; rejects invalid pool ids, unknown tokens, out‑of‑range slippage / gas / position %, etc.
- `PUT /api/agents/sync` and `POST /api/agents`:
  - Reject invalid configs (currently accepted verbatim).
  - On change of `enabledPoolIds` or `approvedTokens`, re‑evaluate active LP positions and flag ones that will be decommissioned next tick.
- Funding wallet note is purely descriptive; we add a typed `fundingNotes` but the real wallet funding address comes from:
  - `agent_wallets.address` for the current chain, surfaced in the UI.

**APIs**

| Method | Route                                      | Purpose                                                             |
| ------ | ------------------------------------------ | ------------------------------------------------------------------- |
| GET    | `/api/agents/[agentId]/wallet`             | Privy agent wallet `{ address, chainId, balanceEth, balanceUsdc }`. |
| POST   | `/api/agents/[agentId]/wallet/fund-intent` | Returns deposit instructions (address + recommended network).       |

**Frontend**

- `agent-capsule-panel.tsx` Funding block shows real address + copy‑to‑clipboard, live balances.
- Config form validates client‑side using the same Zod schema exported via `lib/agents/agent-schema.ts`.

**TODO**

- [x] Shared Zod schema (`lib/agents/agent-schema.ts`) + `prepareAgentForUpsert` / pool-removal warnings (`lib/agents/runtime/validate-config.ts`).
- [x] `GET /api/agents/[agentId]/wallet`, `POST /api/agents/[agentId]/wallet/fund-intent`.
- [x] Funding block in `agent-capsule-panel.tsx` (address, balances, notes).

---

### Phase 8 — Delete dummy code paths

Once Phases 1–5 ship, delete:

- [ ] `lib/agents/arena-pools.ts` → `getPoolChartSim()` _(still used as USD↔chart coordinate bridge until a dedicated mapping replaces it)_.
- [x] `components/dashboard/synthesize-activity.ts` _(removed in Phase 3)_.
- [x] `components/dashboard/mock-arena.ts` _(removed in Phase 5)_.
- [x] `agents-store`: removed runtime box drift interval + `perturbRuntimePriceBoxes`; no `simulateBackgroundPayload` / `appendResolution` / `applyEventToTotals` in repo.
- [x] `transactions-view.tsx` synthetic merge block _(removed in Phase 3)_.
- [x] `dashboard-workspace.tsx` arena merge + `arenaAgents` fabrication _(Phase 5: `useArenaLeaderboard`)_.
- [x] Metrics / dashboard copy — removed client “simulation” drift UI and “sim” price source label _(→ `fallback`)_.

**LLM:** Runtime tick consults OpenAI when `OPENAI_API_KEY` is set (`lib/agents/runtime/llm-evaluate.ts`); rule-based box matching remains the fallback.

---

### Phase 9 — Observability & ops

- [ ] Structured logs (`console.info` → per‑route JSON) for runtime tick + cron jobs.
- [ ] Sentry (optional) on `/api/cron/*`.
- [ ] Rate‑limit dashboard polling endpoints (`next/headers` + a tiny in‑memory bucket).
- [ ] Admin endpoint `GET /api/admin/health` for Mongo, Privy, Uniswap key, subgraph, RPC.

---

## 4. Config / env additions

Append to `lib/rombo/server-env.ts`:

```
ROMBO_RPC_URL_BASE_SEPOLIA
ROMBO_RPC_URL_BASE_MAINNET
ROMBO_RPC_URL_UNICHAIN_SEPOLIA?
ROMBO_RPC_URL_UNICHAIN_MAINNET?
CHAINLINK_FEEDS_BASE                 # JSON map {ETH_USD: 0x..., BTC_USD: 0x...}
ROMBO_CRON_SECRET                    # guards /api/cron/*
ROMBO_TICK_INTERVAL_SECONDS=12
ROMBO_RECEIPT_POLL_INTERVAL_SECONDS=20

OPENAI_API_KEY                         # optional — agent tick box selection (see llm-evaluate.ts)
ROMBO_OPENAI_MODEL=gpt-4o-mini
ROMBO_LLM_AGENT_ENABLED=               # set to false to disable LLM path
```

Vercel cron (sketch `vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/poll-pools", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/agents-tick", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/poll-receipts", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/arena-rebuild", "schedule": "*/5 * * * *" }
  ]
}
```

---

## 5. API surface after full rollout

```
# Auth / session
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

# Agents (config + runtime)
GET    /api/agents
POST   /api/agents
PUT    /api/agents/sync
GET    /api/agents/[agentId]
DELETE /api/agents/[agentId]
GET    /api/agents/[agentId]/wallet
POST   /api/agents/[agentId]/wallet/fund-intent
GET    /api/agents/[agentId]/activity
GET    /api/agents/[agentId]/runs
GET    /api/agents/[agentId]/metrics
GET    /api/agents/metrics?ids=…
POST   /api/agents/[agentId]/tick         (cron-secret)

# Dashboard aggregates
GET /api/dashboard/overview
GET /api/dashboard/transactions

# Live pool data
GET /api/data/pools
GET /api/data/pools/[arenaPoolId]/price
GET /api/data/pools/[arenaPoolId]/candles
GET /api/data/pools/[arenaPoolId]/stats

# Arena
GET /api/arena/leaderboard
GET /api/arena/my-rank

# Trading / LP passthroughs (already exist)
POST /api/trading/{check-approval,quote,swap,order,execute}
POST /api/liquidity/[action]

# Indexer
POST /api/indexer/receipt
POST /api/indexer/webhook
GET  /api/indexer/receipts

# Cron (cron-secret)
POST /api/cron/poll-pools
POST /api/cron/agents-tick
POST /api/cron/poll-receipts
POST /api/cron/arena-rebuild

# Health (optional)
GET /api/admin/health
```

---

## 6. Consolidated TODO (check off as we ship)

### Phase 1 — Live pool data

- [x] Subgraph spot + candles helpers.
- [ ] Chainlink oracle helper + env config (deferred to Phase 2; subgraph bundle ETH/USD already in use).
- [x] `pool_prices`, `pool_candles` collections + TTL indices.
- [x] `/api/data/pools`, `/price`, `/candles`, `/stats` routes.
- [x] `/api/cron/poll-pools` + `vercel.json` schedule + `ROMBO_CRON_SECRET` guard.
- [x] `usePoolLivePrice` + `usePoolCandles` + `usePoolsList`; wired into `AgentChartCanvas` + `DashboardWorkspace`.
- [ ] Remove `getPoolChartSim` (kept as subgraph-unavailable fallback; delete in Phase 8).

### Phase 2 — Agent runtime

- [x] `evaluate-boxes.ts` (+ swap sizing); tests deferred.
- [x] `execute-decision.ts` (swap path; LP automation deferred).
- [x] Privy typed-data sign + `sendTransaction` helpers.
- [x] `agent_runs` collection + repo.
- [x] `/api/agents/[agentId]/tick` + `/api/cron/agents-tick` + `GET .../runs`.
- [x] `/api/cron/poll-receipts`.
- [x] Delete client `setInterval` + chart‑driven `recordResolution`.

### Phase 3 — Real execution log

- [x] `activity-join.ts`.
- [x] `/api/agents/[agentId]/activity`.
- [x] Explorer URL helper.
- [x] Swap `DashboardActivityFeed`, `ReplayControls`, `TransactionsView` to real events.
- [x] Delete `synthesize-activity.ts` (+ workspace now uses hook; optional later: strip `activity` from sync payloads).

### Phase 4 — Real metrics

- [ ] PnL v1 formula + fixtures.
- [ ] Historical price helper.
- [ ] `agent_metrics` collection + repo.
- [ ] `/api/agents/[agentId]/metrics` + batch endpoint.
- [ ] Switch `DashboardMetrics`, `AgentCard`, `OverviewMetrics` to hooks.
- [ ] Remove `agents-store` totals mutation + `pnl-usdc.ETH_USD_REF_FOR_PNL`.

### Phase 5 — Real arena

- [ ] Leaderboard aggregator + cache.
- [ ] `/api/arena/*` routes.
- [ ] Replace `MOCK_ARENA_AGENTS` with hook.
- [ ] Delete mock + merge block.

### Phase 6 — Server‑driven arena resolutions

- [ ] `/api/agents/[agentId]/runs` (+ optional SSE).
- [ ] Chart canvas consumes server events for the visual effect.

### Phase 7 — Server‑enforced config + funding

- [ ] Shared Zod schema for `AgentConfig`.
- [ ] `/api/agents/[agentId]/wallet` + fund intent.
- [ ] Funding panel uses real wallet address + balances.

### Phase 8 — Remove all dummy paths

- [ ] Deletion checklist above.
- [ ] Drop "simulated" language in UI subtitles.

### Phase 9 — Ops

- [ ] Structured logging.
- [ ] Rate limiting on polling endpoints.
- [ ] Health check endpoint.

---

## 7. Suggested shipping order

1. **Phase 1** (live pool data) — unblocks the chart and the rest visually.
2. **Phase 2** (agent runtime) + minimum **Phase 3** — real events flow into Mongo.
3. **Phase 4** (metrics) — flips all KPI plates to real numbers.
4. **Phase 7** (config + funding) — lets users actually fund agents and kick them off.
5. **Phase 5** (leaderboard).
6. **Phase 6** (arena resolutions via SSE) — polish.
7. **Phase 8 + 9** — cleanup + ops.

---

_Maintained alongside `BACKEND_API_ROADMAP.md`. Update the "Current state" table as items move from dummy → real._
