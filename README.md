# Rumble — Autonomous Uniswap Agent Arena

> Your agent gladiates Uniswap liquidity while you sleep. Set boxes. Watch it win.

Rumble is an autonomous trading + liquidity provisioning dashboard for Uniswap. Users create AI-driven agents that monitor live prices on Uniswap v3/v4 pools, react to user-drawn "price box" triggers, execute swaps + LP actions through the **Uniswap Trading API** + **Uniswap Liquidity API**, and compete against each other on a public leaderboard ("Arena").

The repo is a single Next.js 16 app: dashboard UI, agent runtime, Uniswap clients, Privy embedded wallets, Mongo persistence and a Liquidity Lab where users deploy their own ERC-20 + V4 pools.

---

## Features

### Agents

- Per-user, server-persisted agents with goals, risk levels, approved tokens, gas caps, slippage, bet sizing.
- Agent ticks in production: Vercel Cron calls `/api/cron/agents-tick` **once per day** (06:00 UTC) — Vercel **Hobby** only allows daily-or-slower crons. For frequent simulation while you browse, the dashboard uses `use-agent-tick-while-running` to POST `/api/agents/[id]/tick` on an interval.
- Decisions come from a price-box evaluator (`lib/agents/runtime/evaluate-boxes.ts`); when `OPENAI_API_KEY` is set the LLM picks among the user's boxes via `lib/agents/runtime/llm-evaluate.ts` (rules fallback otherwise).
- **Sim mode**: every action is paper money. Each tick mutates a per-user `user_sim_wallets` doc, writes synthetic `trading_attempts` + `onchain_receipts` rows, and rolls a stochastic outcome multiplier with risk-band-clamped P&L. Synthetic per-action P&L is hard-capped at ±$2 USD so the activity feed reads as steady drift. There is no on-chain execution from the agent runtime — the wallet snapshot is taken once from the Privy embedded balance and frozen.
- **No-skip activity**: when the box evaluator (or the LLM) would otherwise return a `skip`, the runtime substitutes a small "scout" swap so the dashboard, P&L, gas, win-rate and arena rank keep moving.

### Liquidity Lab

- Deploy ERC-20s and Uniswap **v4** pools straight from `dashboard/liquidity-lab` using the connected wallet (RainbowKit + wagmi).
- Add liquidity via the **Liquidity Provisioning API** (`/lp/check_approval` → broadcast token approvals → EIP-712 sign Permit2 batch → `/lp/create` or `/lp/increase`). EIP-712 normalisation handles the API's nested `{ fields: [...] }` types and stringified `chainId`.
- User-deployed pools are persisted in `lab_pools` and selectable per-agent via `enabledLabPoolIds`.

### Dashboard

- Live candlestick + range-band chart (`recharts` + custom canvas) per arena pool with WebSocket-style polling for fresh ticks.
- Draggable / resizable price boxes with an action label (`swap` / `add_liquidity` / `remove_liquidity`) and amount %.
- Execution log fed by `agent_runs` joined with `trading_attempts` + `onchain_receipts`; shows narrative, multiplier, gas-gwei, tx hash short.
- Overview metrics card (Actions / Fills / Skips / Win rate / Net P&L USD / Gas USD) with cached rollups in `agent_metrics`.
- Public arena leaderboard at `/api/arena/leaderboard` with cohort-relative scoring (`0.6 × pnlNorm + 0.3 × winRate + 0.1 × log(actions)`).

### Arena

- One leaderboard per arena pool per range (`24h` / `7d` / `30d` / `all`).
- Cache rebuilt on the daily `/api/cron/arena-rebuild` cron, on-read when older than 30 s, **and** fire-and-forget after every successful tick (only the pools the agent traded). Net effect: rank changes within ~30 s of a sim trade.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| **Framework** | Next.js 16 (App Router) + React 19 + TypeScript |
| **Styling** | Tailwind CSS 4 + Radix UI primitives + Framer Motion |
| **Wallet (UI)** | Privy embedded wallet for navbar / agents; RainbowKit + wagmi for Liquidity Lab |
| **EVM** | viem 2.48 + wagmi 2.19; Base Sepolia (84532) testnet, Base mainnet (8453) |
| **Uniswap** | Trading API (`/check_approval`, `/quote`, `/swap`, `/order`) + Liquidity API (`/lp/*`) — wrapped by `lib/integrations/uniswap/` |
| **Backend** | Next.js route handlers (`app/api/**`) + server-only modules (`lib/**`) |
| **DB** | MongoDB (Atlas in prod, local in dev). Collections: `agents`, `agent_runs`, `agent_metrics`, `agent_sim_lp_positions`, `arena_leaderboards`, `lab_pools`, `lp_positions`, `onchain_receipts`, `pool_prices`, `trading_attempts`, `user_sim_wallets`, `users`. |
| **Pricing fallback** | Chainlink ETH/USD feeds via `lib/onchain/chainlink-feeds.ts`; Uniswap v3 subgraph for arena pool snapshots. |
| **LLM** | OpenAI Chat Completions (default `gpt-4o-mini`) — optional. |
| **Indexer** | Inbound `/api/indexer/webhook` and per-tx receipt poller (`lib/indexer/poll-receipt.ts`). |
| **Cron** | Vercel Cron (`vercel.json`): all jobs run **at most once per day** on Hobby — `poll-pools` 00:00 UTC, `agents-tick` 06:00 UTC, `poll-receipts` 12:00 UTC, `arena-rebuild` 18:00 UTC. Upgrade to Pro for sub-daily schedules. |

---

## Repository layout

```
app/                    Next.js app router — routes + page-level UI
  api/                   Route handlers grouped by surface (agents, arena, auth, cron, data, indexer, liquidity, privy, trading)
  dashboard/             Authed dashboard pages (overview, agent capsule, transactions, arena, liquidity-lab)
  auth/, page.tsx        Marketing + auth surfaces
components/
  dashboard/             Workspace, chart canvas, price boxes, capsule panel, lab pool picker
  liquidity-lab/         Liquidity Lab client (deploy + add LP)
  ui/                    Radix-derived design system
lib/
  agents/                Agent types, defaults, runtime (tick / evaluate / simulate), metrics aggregation, activity-join
  api/                   Server helpers (audit, cron-auth, persistence)
  arena/                 Leaderboard scoring + rebuild + cache helpers
  data/                  Pool price refresh + storage
  db/                    Mongo client + repositories (one per collection)
  indexer/               Receipt polling + webhook event mapping
  integrations/
    privy/                 Server-side Privy client + embedded-wallet bridging + signing
    uniswap/               Trading + Liquidity API clients, retry + rate-limit + token resolution
  liquidity/             LP policy + price-box bounds
  liquidity-lab/         viem helpers for v4 pool init + Permit2 typed-data normalisation
  onchain/               Chainlink + ERC-20 + agent wallet balance helpers
  rumble/                Server env loader, chain config, JSON-RPC helper
contracts/              Foundry workspace for the lab's MinimalToken (ERC-20)
docs/                   Architectural notes, Uniswap reference, dashboard plan
```

---

## Getting started

### Prerequisites

- Node.js 20+
- A MongoDB connection string (Atlas free tier is fine; local Mongo also works)
- Accounts:
  - [Uniswap Developer Dashboard](https://developers.uniswap.org/dashboard) for `UNISWAP_API_KEY`
  - [Privy Dashboard](https://dashboard.privy.io/) for `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and (for agent-controlled wallets) `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY`
  - [Reown / WalletConnect Cloud](https://cloud.reown.com) for `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
  - Optional: [OpenAI](https://platform.openai.com) for LLM-driven box selection
  - Optional: [The Graph Network](https://thegraph.com/explorer) gateway key + a Uniswap v3 Base subgraph for live arena pool data

### Install + run

```bash
git clone <this repo>
cd rombo
npm install
cp .env.example .env.local        # then fill in the values noted below
npm run dev                       # starts Next.js on http://localhost:3000
```

The dev server hot-reloads everything except `.env.local` changes. After editing env vars, restart with `npm run dev`.

### Environment variables

The full list with descriptions lives in [`.env.example`](./.env.example). The minimum to boot a usable dashboard against testnet:

```bash
MONGODB_URI=mongodb+srv://...                       # required
RUMBLE_TARGET_NETWORK=testnet                       # picks Base Sepolia (84532)

# Privy
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY=...          # leave blank if you only need session auth

# Liquidity Lab wallet UI
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# Uniswap
UNISWAP_API_KEY=...
```

Optional but recommended for the best demo experience:

```bash
OPENAI_API_KEY=...                                  # enables LLM-driven box selection
RUMBLE_OPENAI_MODEL=gpt-4o-mini
UNISWAP_V3_SUBGRAPH_URL=...                         # live arena prices via The Graph
THE_GRAPH_API_KEY=...
RUMBLE_RPC_URL=...                                  # custom RPC; otherwise public Base / Base Sepolia
RUMBLE_CRON_SECRET=...                              # protect cron + indexer webhook in prod
```

### Smart contracts

The Liquidity Lab deploys a minimal ERC-20 (`contracts/src/MinimalToken.sol`) when the user creates a lab pool. Build the artifact once with Foundry:

```bash
npm run contracts:build
```

That writes `contracts/out/MinimalToken.sol/MinimalToken.json` plus a slimmed JSON the Lab loads at runtime.

### Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint over the whole repo |
| `npm run test:metrics` | `tsx --test` runs P&L + swap-amount unit tests |
| `npm run contracts:build` | Build Foundry contracts + regenerate the lab's slim ABI artifact |

---

## How a tick works

1. **Vercel Cron** (`/api/cron/agents-tick`, daily on Hobby) **or** the in-dashboard hook calls `runAgentTick(agentDoc)` (`lib/agents/runtime/tick.ts`).
2. The runtime resolves the user's shared simulated wallet (`ensureUserSimWallet`) — first call snapshots the live Privy embedded ETH/USDC balance with a paper-money minimum.
3. For each enabled arena pool:
   1. Resolve display USD via `lib/data/pool-prices.repo.ts` (or fall back to `getPoolChartSim(...).usdFromSim(mid)`).
   2. Call `evaluateRuntimeDecision(...)` (LLM if enabled, rules otherwise).
   3. If the decision is a **soft** skip (`no_box_hit`, `llm:*`, `zero_notional`, …), substitute `synthesizeFallbackArenaSwap(...)` so something still happens.
   4. Run `simulateAgentDecision(...)` — mutates `user_sim_wallets`, writes `trading_attempts` + `onchain_receipts`, returns realised P&L (capped to ±$2 USD).
   5. Persist an `agent_runs` row with the narrative, multiplier, gas, tx hash.
4. Repeat for any opted-in lab pools (`enabledLabPoolIds`).
5. Fire-and-forget `refreshAgentMetricsRollupsForAgent` and `refreshArenaLeaderboardsForAgent` so dashboard + arena reflect the new state within seconds.

---

## Production notes

- **Cron auth**: set `RUMBLE_CRON_SECRET` and pass `?token=<secret>` (or `x-rumble-cron-secret`) on every Vercel Cron call. Local dev bypasses auth automatically.
- **Rate limiting**: the Uniswap client wrapper (`lib/integrations/uniswap/rate-limiter.ts`) shapes requests to ≈5 RPS shared across Trading + Liquidity. On HTTP 429 it backs off with jitter — never spin tight loops.
- **Receipts**: `/api/cron/poll-receipts` and the inbound `/api/indexer/webhook` (HMAC-protected by `RUMBLE_INDEXER_WEBHOOK_SECRET`) keep `onchain_receipts` warm for metrics + leaderboards.
- **Mongo indexes**: each repo lazily ensures its indexes on first read/write. Reset locally by dropping the collection.
- **Privy authorization key**: in production keep `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY` in a KMS, never in source.

---

## Documentation

Deeper notes live under [`docs/`](./docs):

- [`ARCHITECTURE_DECISIONS.md`](./docs/ARCHITECTURE_DECISIONS.md) — major design choices and why.
- [`BACKEND_API_ROADMAP.md`](./docs/BACKEND_API_ROADMAP.md) — surfaces planned vs shipped.
- [`DASHBOARD_INTEGRATION_PLAN.md`](./docs/DASHBOARD_INTEGRATION_PLAN.md) — dashboard ↔ backend contract.
- [`PRIVY_SETUP.md`](./docs/PRIVY_SETUP.md) — Privy app + authorization key + policies.
- [`UNISWAP_API_REFERENCE.md`](./docs/UNISWAP_API_REFERENCE.md) — Trading + Liquidity API operational notes.
- [`prd.md`](./prd.md) — original product brief.
- [`feedback.md`](./feedback.md) — DX feedback for the Uniswap Developer Platform.

---

## License

Hackathon project — license TBD. Contact the team before re-using.
