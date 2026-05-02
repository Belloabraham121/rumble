# Privy — Rumble server setup

Use this with **`docs/BACKEND_API_ROADMAP.md` §2** and **`docs/ARCHITECTURE_DECISIONS.md`**. Rumble keeps **cookie sessions** as the dashboard auth source of truth in phase 1; Privy users are created or linked **after** login so embedded wallets map to your app user id.

## 1. Dashboard configuration

1. Create or open your app in the [Privy Dashboard](https://dashboard.privy.io/).
2. Add **allowed origins** for local and production URLs (e.g. `http://localhost:3000`, your Vercel domain).
3. Under **Authentication**, enable the providers you want (email, wallet, etc.) so they match how Rumble users sign in today or how you plan to migrate.
4. Enable **embedded wallets** if human users should get an in-app wallet.
5. For **agent / server-controlled wallets** (Model 1 style), create an **authorization key** in the dashboard and store the private key only on the server ([authorization keys](https://docs.privy.io/controls/authorization-keys)).

## 2. Environment variables

Copy from `.env.example` into `.env.local` (never commit secrets):

| Variable | Purpose |
|----------|---------|
| `PRIVY_APP_ID` | App identifier from the Privy dashboard |
| `PRIVY_APP_SECRET` | Server secret — **never** expose to the browser |
| `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY` | Private key for signing Wallet API requests for agent/automation flows |

Runtime flags (no secret values) are exposed via `getRumbleServerEnv()` in `lib/rumble/server-env.ts` (`hasPrivyApp`, `hasPrivyWalletAuthz`).

## 3. Server SDK entrypoint

- **`lib/integrations/privy/server-client.ts`** — `getPrivyServerClient()` returns a `PrivyClient` when `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are set, otherwise `null`.
- Re-exports **`generateAuthorizationSignature`** and **`AuthorizationContext`** from `@privy-io/node` for wallet API calls that require a signed authorization payload.

Follow Privy’s Node setup and server signing docs:

- [Node SDK setup](https://docs.privy.io/basics/nodeJS/setup)
- [Signing on the server](https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server)

## 4. Aligning with another repo (e.g. “Marshmallow”)

If you implemented server-side signing elsewhere, mirror the same **`AuthorizationContext`** construction and call **`generateAuthorizationSignature`** (or the SDK helper on `client.utils()`) before hitting Privy wallet endpoints. Rumble does not bundle that external project; paste or symlink the signing snippet here when you have a path on disk.

## 5. Implemented server flows (Rumble)

| Flow | Code / route |
|------|----------------|
| Mongo user upsert + Privy user + embedded ETH wallet on login | `lib/integrations/privy/bridge-user.ts`, triggered from `app/api/auth/login/route.ts` |
| Authorization PKCS8 helper | `lib/integrations/privy/authz-context.ts`, `pkcs8.ts` |
| Agent programmatic wallet (owner = human Privy user) | `ensureAgentPrivyWallet` — **`POST /api/privy/agent-wallet`** JSON `{ "agentId": "<uuid>" }` with session cookie |
| Sign `personal_sign` with authorization key | `lib/integrations/privy/wallet-signing.ts` |

Requires **`MONGODB_URI`** for durable user ↔ agent-wallet mapping (agent API returns 503 without it).

## 6. Next product steps

1. Surface embedded + agent wallet addresses in dashboard funding UX.
2. Wire **`ethereum().signTransaction` / `sendTransaction`** from agent execution to Uniswap (see `BACKEND_API_ROADMAP.md` §3).
3. Optional: Privy **user-in-the-loop** flows using the user access token when high-value actions need explicit approval.
