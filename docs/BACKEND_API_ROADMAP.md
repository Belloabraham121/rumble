# Rombo — backend API, Privy & Uniswap roadmap

This document lists **UI-complete features that still need server/API implementation**, aligned with **Privy** (accounts + programmable / agent wallets + signing) and **Uniswap** (quotes, swaps, liquidity, approvals). Use it as a master backlog; check items off as you ship.

**References**

| Area | Primary docs |
|------|----------------|
| Privy — agent experiences overview | [Agent integrations overview](https://docs.privy.io/recipes/agent-integrations/overview) |
| Privy — agentic wallets (policies, authorization keys) | [Agentic wallets](https://docs.privy.io/recipes/wallets/agentic-wallets) |
| Privy — server-side user wallets (session signer, app-initiated tx) | [Server-side user wallets](https://docs.privy.io/recipes/wallets/server-side-user-wallets), [User and server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers) |
| Uniswap — Trading API flow | [Swapping via the Uniswap API](https://developers.uniswap.org/docs/trading/swapping-api/getting-started), [API reference](https://developers.uniswap.org/docs/api-reference) |
| Uniswap — Liquidity provisioning | [Liquidity provisioning API — getting started](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started) |
| Uniswap — errors, rate limits, LP flows | **[Rombo reference](./UNISWAP_API_REFERENCE.md)** + **`lib/integrations/uniswap/`** (stable codes, throttle, `fetchUniswap`) |
| Privy — dashboard + env | **[Privy setup](./PRIVY_SETUP.md)** + **`lib/integrations/privy/server-client.ts`** |
| Uniswap — AI / agent tooling (optional accelerator) | Repo note: `npx skills add Uniswap/uniswap-ai`, plugins such as `uniswap-trading` / `uniswap-viem` — see [Uniswap Developers](https://developers.uniswap.org/) |

> **Note:** Exact host paths (`trade-api.gateway.uniswap.org`, `liquidity.api.uniswap.org`, etc.) and query shapes change over time. Treat endpoint names below as **integration targets**; verify against the official API reference before implementation.

---

## 1. Architecture decisions (implemented)

Decisions are **documented** in [`docs/ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) and **encoded** under `lib/rombo/`:

| Topic | Resolution |
|-------|----------------|
| **Auth** | Phase 1: **cookie session** (`getSession`) stays source of truth for `/dashboard`. Phase 2: bridge email users to Privy user ids when wiring wallets — see ADR. |
| **Wallet model** | Default **`agentic_per_agent`** (Privy Model 1). Override with `ROMBO_AGENT_WALLET_MODEL=user_scoped_signer` for Model 2–style signers. See `lib/rombo/wallet-model.ts`. |
| **Chains** | Testnet-first: default chain id **84532** (Base Sepolia) via `ROMBO_TARGET_NETWORK=testnet`. Full slug ↔ id map in `lib/rombo/chain-config.ts`. |
| **Secrets** | `.env.example` lists `MONGODB_URI`, `PRIVY_*`, `UNISWAP_API_KEY`. Runtime flags **without** exposing values: `getRomboServerEnv()` in `lib/rombo/server-env.ts`. |
| **Database** | **MongoDB** for users, onchain tx rows, agent sync, Privy id mapping — see ADR §5. |

- [x] **Auth source of truth** — Documented bridge plan (session now, Privy user mapping next).
- [x] **Wallet model** — Default Option A; env switch for Option B.
- [x] **Chain targets** — Canonical ids + defaults aligned with UI slugs.
- [x] **Secrets** — Env template + typed server loader (includes Mongo URI).
- [x] **Persistence** — MongoDB documented; `hasMongo` + `mongodbUri` on server env.

---

## 2. Privy — accounts & wallets

### 2.1 User-facing wallets (embedded)

- [x] Configure Privy app + auth provider alignment with existing Rombo login — **[PRIVY_SETUP.md](./PRIVY_SETUP.md)**; server client: `lib/integrations/privy/server-client.ts` (dashboard OAuth/email toggles remain manual per environment).
- [x] On successful login: **create or fetch Privy user** mapped to your app user id — `syncPrivyUserAfterLogin` in `lib/integrations/privy/bridge-user.ts` (+ Mongo `users` row via `upsertUserByEmail`).
- [x] **Embedded wallet** creation / linking — `pregenerateWallets` when missing; addresses persisted on the user document when Mongo is enabled.
- [x] **Policies** (optional) — create policies in Privy Dashboard; set **`PRIVY_DEFAULT_POLICY_IDS`** (comma-separated; first id applied where the API allows one policy per wallet).

### 2.2 Agent wallets & signing (agent executes on behalf of user/product)

Privy supports **programmable agent wallets** with **policy guardrails** and **server-side signing** via authorization keys (see [Agentic wallets](https://docs.privy.io/recipes/wallets/agentic-wallets)).

- [x] **Create authorization keys** in Privy Dashboard; store **`PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY`** securely (never commit).
- [ ] **Register keys** in a **key quorum** if you want multi-party approval for policy changes / exports (product-specific).
- [x] **Define policies** in Dashboard; attach policy IDs via **`PRIVY_DEFAULT_POLICY_IDS`** on embedded + agent wallet creation.
- [x] **Create wallet(s)** per Rombo agent — `ensureAgentPrivyWallet` (`lib/integrations/privy/agent-wallet.ts`); **`POST /api/privy/agent-wallet`** with `{ "agentId": "<id>" }` (session auth).
- [x] **Backend signing path**
  - [x] Initialize **Privy Node SDK** via `getPrivyServerClient()` and **`walletAuthorizationContext()`** (`lib/integrations/privy/authz-context.ts`) using PKCS8 (PEM or raw base64).
  - [x] **Wallet API signing** — `signEthereumPersonalMessageWithAuthorizationKey` (`lib/integrations/privy/wallet-signing.ts`); extend with `ethereum().signTransaction` / `sendTransaction` as trading flows land.
- [ ] **User-in-the-loop paths** (optional but typical for high value)
  - [ ] Request **ephemeral user key** from user access token when the user must approve (see server-side user wallets recipe).
  - [ ] Distinguish **agent-autonomous** vs **user-confirmed** transactions in product UX.

### 2.3 Sub-todos — Privy surfaces to wire (SDK / REST)

Use the official Privy docs for exact routes; typical areas include:

- [x] Users / identities — `getByEmailAddress` / `create` / `setCustomMetadata` (`bridge-user.ts`).
- [x] Wallets — `pregenerateWallets`, `wallets().create` for agents (`agent-wallet.ts`).
- [ ] Transactions — construct / send via SDK after policy checks (wire to Uniswap execution next).
- [x] Policies — attach at wallet creation via env ids; update / quorum flows still optional.

---

## 3. Uniswap — Trading API (swaps, approvals, orders)

**Purpose:** Execute swaps and related flows that the Rombo chart + agent strategies already simulate.

**Documented flow (high level):**

1. **Permit2 / allowance** — `check_approval` → if needed, user/agent signs approval tx ([check_approval](https://developers.uniswap.org/docs/api-reference/check_approval)).
2. **Quote** — `quote` with tokens, amounts, chains, slippage, `protocols` ([aggregator quote](https://developers.uniswap.org/docs/api-reference/aggregator_quote)).
3. **Execute**
   - Classic AMM route → **`swap`** (or create swap transaction per current reference naming: [create swap](https://developers.uniswap.org/docs/api-reference/create_swap_transaction)).
   - UniswapX / gasless route → **`order`** ([post order](https://developers.uniswap.org/docs/api-reference/post_order)).

### 3.1 Implementation checklist

- [ ] Obtain **Uniswap API key** from [Uniswap developer dashboard](https://developers.uniswap.org/).
- [ ] Server module: **`POST .../check_approval`** — inputs: token, wallet, chain, spend approval context.
- [ ] Server module: **`POST .../quote`** — align with Rombo **slippage**, **token**, **chain**, **pool** config from `AgentConfig`.
- [ ] Server module: **`POST .../swap` or `.../order`** — based on quote routing (`CLASSIC` vs UniswapX); submit signed payload from Privy-backed wallet.
- [ ] **Minimum quote thresholds** — UniswapX has min notionals on L1/L2; handle “no quotes” in UI.
- [ ] **Idempotency / retries** — quote expiry, nonce handling, failed broadcast reconciliation.

### 3.2 Sub-todos — data you must persist (MongoDB)

- [ ] Map **Rombo arena pool** labels → **chain id + token addresses + fee tier / pool id** for quotes.
- [ ] Store **last quote id / calldata hash** for debugging and replay tooling (Mongo collections per `docs/ARCHITECTURE_DECISIONS.md` §5).

### 3.3 Rate limits, headers & HTTP errors (Trading API)

Summarized from Uniswap’s official **Troubleshooting** doc — full tables and remediation live in **[`docs/UNISWAP_API_REFERENCE.md`](./UNISWAP_API_REFERENCE.md)**.

| Topic | Summary |
|-------|---------|
| **Rate limit** | Default **6 RPS** per key → **429** if exceeded; pause traffic and retry with backoff; higher limits via Uniswap support / dashboard. |
| **Headers** | **`Accept`** and **`Content-Type`** must be **`application/json`** only (strict validation). |
| **401** | Invalid/missing **`x-api-key`** or bad headers. |
| **400** | Validation — missing fields, malformed addresses, bad enums. |
| **404** | Often “No quotes available” — min **UniswapX** notionals (e.g. **~1000 USDC eq on Base/L2**, **~300** on L1), wrong chain/token pairing, or illegal bridge+swap combo. |
| **500 / 504** | Server/gateway — retry with backoff. |

---

## 4. Uniswap — Liquidity provisioning API (LP add / remove / positions)

**Purpose:** Replace simulated “add liquidity / remove liquidity / claim” activity with real LP actions ([Liquidity provisioning API](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started)).

Official flow ([Liquidity getting started](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started)):

1. **`check_approval_lp`** — token approvals before LP actions.
2. **`create_lp_position`** — if the **pool does not exist**, the API returns a **pool-creation transaction** to sign first, plus the **position** transaction.
3. **`increase` / `decrease` / `claim` fees / `migrate` / `claim_rewards`** — manage existing NFT positions.

Endpoint names and hosts: always use the current [API reference](https://developers.uniswap.org/docs/api-reference). **Creating pairs** is covered by the **create LP position** response when the pool is missing (no separate “create pair” hack).

### 4.1 Liquidity API — errors & rate limits

Same **`x-api-key`** and **header discipline** as Trading API; share the **6 RPS** budget across swap + LP clients unless your dashboard says otherwise. LP-specific **400**s usually mean bad ranges, protocol mismatch, or missing position id — see **[`docs/UNISWAP_API_REFERENCE.md`](./UNISWAP_API_REFERENCE.md) §5–6**.

### 4.2 Sub-todos

- [ ] Map Rombo **price boxes** → onchain **tick ranges** for the chosen pool (protocol math via SDK or API-provided helpers).
- [ ] Persist **position NFT token id** per agent + pool in **MongoDB**.
- [ ] Handle **IL / rebalance** policies as Privy policy + app logic.

---

## 5. Indexing, subgraph & “live” dashboard data

Persist indexed rows to **MongoDB** for API reads from the dashboard.

- [ ] **Subgraph or Uniswap data APIs** — pool TVL, fees, historical swaps for leaderboard accuracy (see mechanics: shared environment).
- [ ] **Transaction receipts** — map Rombo “Execution log / Transactions” rows to **real tx hashes**, block time, gas used.
- [ ] **Webhooks or polling** — update agent PnL from onchain events.

---

## 6. Rombo product features → API backing

| Feature (current UI) | Backend work |
|---------------------|--------------|
| Multi-pool agent config (`tradeAllPools`, `enabledPoolIds`) | Resolve to token addresses + pool ids; enforce in quote/LP calls |
| Chart + arena resolutions | Optional: drive from live price feed instead of sim only |
| Activity / Transactions pages | Persist events from webhook indexer + link Privy wallet + Uniswap tx |
| Runtime price boxes | Optional: translate hits into signed swap/LP txs within policies |
| Leaderboard / PnL in USDC display | Compute from onchain balances + oracle for USD |

---

## 7. Uniswap “agent skills” / AI toolkit (optional, not a substitute for APIs)

These accelerate **agent development** (tool-calling, plugins) but **production** still needs your own server orchestration, Privy signing, and compliance:

- [ ] Evaluate **Uniswap AI skills** (e.g. `npx skills add Uniswap/uniswap-ai`) and plugins (**`uniswap-trading`**, **`uniswap-viem`**) as in `feedback.md` / internal notes — useful for agent tooling in development; not a substitute for the official Trading / Liquidity APIs in production.
- [ ] Keep **Trading API + Liquidity API** as the **source of truth** for live trades Rombo users rely on.

---

## 8. Security & compliance checklist

- [ ] Never store Privy authorization private keys in repo or client.
- [ ] Policy-first defaults for agent wallets (low limits on testnet → tighten for mainnet).
- [ ] Audit logs: who signed, which policy version, quote id, chain id.
- [ ] Rate limits on server endpoints that call Uniswap / Privy.

---

## 9. Suggested implementation order

1. Privy user + embedded wallet + map user id.
2. Uniswap `check_approval` + `quote` + single-chain **swap** on testnet from **server** using a **test wallet**.
3. Privy **agent wallet** + policies + swap via agent wallet.
4. Liquidity **increase / decrease** on testnet; store position ids.
5. Indexer + replace simulated activity with real hashes in Transactions UI.
6. Harden for mainnet + monitoring.

---

*Last updated: generated for Rombo dashboard roadmap. For Uniswap rate limits, HTTP errors, LP pool-creation flow, and operational checklists, see [`docs/UNISWAP_API_REFERENCE.md`](./UNISWAP_API_REFERENCE.md). Adjust endpoint URLs and field names against the latest Privy and Uniswap API references before implementation.*
