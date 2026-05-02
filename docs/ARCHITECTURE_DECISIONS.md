# Architecture decisions — auth, Privy, chains, secrets

This document **implements §1** of `BACKEND_API_ROADMAP.md`: concrete choices and how they map to code (`lib/rumble/*`).

---

## 1. Auth source of truth & Privy bridge

**Decision (phase 1 — current):** Rumble remains **`SessionUser`** via HTTP-only cookie (`lib/auth/session.ts`, email login). This stays the **source of truth for dashboard access**.

**Decision (phase 2 — planned):** Introduce **Privy** for embedded wallets and optional social/email parity **without** dropping sessions overnight:

1. User signs in with existing Rumble auth → `getSession()` returns `{ email }`.
2. Backend calls Privy **once per user** to `createUser` / lookup using a stable id derived from your user record (e.g. hashed email + pepper, or UUID stored in DB later).
3. Store mapping **`rumble_user_id` ↔ `privy_user_id`** in **MongoDB** (see §5).
4. Optionally migrate primary UX to Privy login later; until then, cookie session gates `/dashboard`, Privy backs wallets only.

**Non-goals for phase 1:** Replacing the cookie with Privy JWT-only auth.

---

## 2. Wallet model per Rumble agent

**Default:** **`agentic_per_agent`** — aligns with Privy **Model 1** ([Agentic wallets](https://docs.privy.io/recipes/wallets/agentic-wallets)): each arena agent gets (or will get) a **dedicated programmatic wallet** controlled by your backend via **authorization keys** and **policies**.

**Alternative (env flag):** **`user_scoped_signer`** — Privy **Model 2** style: user-owned wallet with **scoped agent signer**; users revoke agent access independently.

**Configuration:** Set `RUMBLE_AGENT_WALLET_MODEL` (see `.env.example`). Parsed in `lib/rumble/wallet-model.ts`.

---

## 3. Chain targets

**Default runtime for integrations:** **Testnet-first.**

| Environment | Default chain id | Slug (`AgentConfig.chain`) |
|-------------|------------------|------------------------------|
| `RUMBLE_TARGET_NETWORK=testnet` (default) | `84532` | `base-sepolia` |
| Override | `RUMBLE_DEFAULT_CHAIN_ID` | Must match `CHAIN_ID_BY_SLUG` in `lib/rumble/chain-config.ts` |
| Production orientation | `8453` | `base-mainnet` when you flip target to mainnet |

UI today offers **Base Sepolia** and **Unichain Sepolia** in agent settings; numeric ids for **Unichain Sepolia (1301)** and **Unichain Mainnet (130)** are in `chain-config.ts` for future Trading API wiring.

**Rule:** Before executing real swaps/LP, confirm the pair exists on that chain in Uniswap [supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

---

## 4. Secrets & storage

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | **MongoDB** connection string (Atlas `mongodb+srv://…` or local) |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Privy server SDK / REST for users & wallets |
| `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY` | Signs Privy Wallet API requests for **agent/automation** paths |
| `UNISWAP_API_KEY` | `x-api-key` for Trading + Liquidity APIs |
| `UNISWAP_UNIVERSAL_ROUTER_VERSION` | Optional — **`x-universal-router-version`** header (default `2.0`); must stay aligned across `/quote` and `/swap` |

**Storage rule:** Production uses **environment variables** injected by the host (Vercel, Fly, etc.) or **KMS / secrets manager** for the authorization private key — **never** commit real values.

**Introspection:** Server code can call `getRumbleServerEnv()` (`lib/rumble/server-env.ts`) for booleans `hasMongo`, `hasPrivyApp`, `hasPrivyWalletAuthz`, `hasUniswap` without logging secrets.

---

## 5. Persistence — MongoDB

**Decision:** Application data lives in **MongoDB** (driver/ODM choice up to you — Mongoose, native driver, Prisma with Mongo, etc.).

**Typical collections** (suggested; refine as you implement):

| Collection / domain | Contents |
|---------------------|----------|
| `users` | Stable user id, email, timestamps; optional `privyUserId` after bridge |
| `agents` | Server-authoritative agent records when you sync off localStorage — config, wallet refs |
| `transactions` | Onchain-backed execution rows (hash, chain id, agent id, kind, metadata) |
| `trading_attempts` | Uniswap **`requestId`**, hashed payloads / calldata, routing, optional quote deadlines, errors (`lib/db/trading.repo.ts`) |
| `wallet_chain_nonces` | Last broadcast **nonce** (+ optional tx hash) per wallet + chain for reconciliation |
| `sessions` | Optional if you move beyond cookie-only auth |

**Env:** `MONGODB_URI` is read in `getRumbleServerEnv()` as `mongodbUri` with **`hasMongo`** when set.

**UI note:** The dashboard still uses **browser localStorage** for agents until you add sync APIs writing to Mongo.

---

## Code map

| Module | Role |
|--------|------|
| `lib/rumble/chain-config.ts` | Slug ↔ chain id |
| `lib/rumble/wallet-model.ts` | Agent wallet model enum + parser |
| `lib/rumble/server-env.ts` | Validates env (incl. `MONGODB_URI`); exposes typed flags |
| `lib/db/mongo-client.ts`, `lib/db/users.repo.ts`, `lib/db/agent-wallets.repo.ts`, `lib/db/trading.repo.ts` | Mongo persistence for users, agent wallets, trading audit rows |
| `lib/trading/arena-pool-onchain.ts` | Arena pool id → chain id, **v3 fee tier**, token pair addresses |
| `lib/api/trading-audit.ts`, `lib/api/trading-meta.ts` | Session audit identity + strip Rumble-only JSON fields before Uniswap |
| `lib/integrations/uniswap/retry.ts`, `quote-metadata.ts` | Transient retry backoff + **`requestId`** / deadline / calldata hashing |
| `lib/integrations/privy/bridge-user.ts`, `agent-wallet.ts`, `wallet-signing.ts` | Privy user bridge, agent wallets, server signing |

---

*Revise this ADR when Privy login replaces cookie auth or when mainnet becomes default.*
