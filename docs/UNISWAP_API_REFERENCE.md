# Uniswap Labs APIs — Rumble backend reference

Operational notes distilled from **official Uniswap Developer docs** ([Trading API troubleshooting](https://developers.uniswap.org/docs/trading/swapping-api/common-errors), [Liquidity provisioning — getting started](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started), [API reference](https://developers.uniswap.org/docs/api-reference)). **Re-verify** hosts, paths, and schemas before shipping — Uniswap updates these regularly.

---

## 1. Base URLs & auth

| API surface | Typical base (confirm in current docs) | Auth |
|-------------|----------------------------------------|------|
| **Trading API** (swap, quote, approvals, orders) | `https://trade-api.gateway.uniswap.org/v1` | Header **`x-api-key: <your-key>`** on every request |
| **Liquidity provisioning API** | Default host **`https://liquidity.api.uniswap.org`** (`/lp/*` — confirm in [API reference](https://developers.uniswap.org/docs/api-reference)); override via **`UNISWAP_LIQUIDITY_API_BASE`** | Same **`x-api-key`** pattern on Uniswap Developer Platform keys |

Obtain keys from the [Uniswap Developer Dashboard](https://developers.uniswap.org/dashboard). Store as `UNISWAP_API_KEY` server-side only (`lib/rumble/server-env.ts`).

---

## 2. Request headers (strict)

Per [Troubleshooting — Headers](https://developers.uniswap.org/docs/trading/swapping-api/common-errors):

- Use **`Accept: application/json`** and **`Content-Type: application/json`** — values should be **only** `application/json` (no extra charset fragments unless officially documented).
- Missing / malformed headers contribute to **401 Unauthorized**.

**Trading approval endpoint** also documents optional header **`x-permit2-disabled`** (`true` | `false`): when `true`, Permit2 approval flow is bypassed for integrators using direct approve-then-swap ([check_approval](https://developers.uniswap.org/docs/api-reference/check_approval)).

---

## 3. Rate limiting

Per [Troubleshooting — Rate limits](https://developers.uniswap.org/docs/trading/swapping-api/common-errors):

| Item | Detail |
|------|--------|
| **Default budget** | Most keys: **6 requests per second (RPS)** |
| **Exceeded** | Expect HTTP **429 Too Many Requests** |
| **Recommended handling** | **Pause** all outbound requests from that API key, then **retry** after a cool-down (implement exponential backoff + jitter in Rumble’s Uniswap client wrapper) |
| **Higher throughput** | Contact [Uniswap Developer Support](https://support.uniswap.org/hc/en-us/requests/new) or use options in the [Developer Dashboard](https://developers.uniswap.org/dashboard) |

**Rumble implementation**

| Piece | Location |
|-------|----------|
| Rate shaping (~5 RPS default, shared **Trading + Liquidity**) | `lib/integrations/uniswap/rate-limiter.ts` |
| Stable error codes (`UNISWAP_RATE_LIMITED`, `UNISWAP_NO_QUOTE`, …) | `lib/integrations/uniswap/errors.ts` |
| Authenticated `fetch` + JSON helper | `lib/integrations/uniswap/http.ts` (`fetchUniswap`, `readUniswapJsonOrThrow`) |
| Liquidity `/lp/*` client | `lib/integrations/uniswap/liquidity.ts` |
| Session API passthrough + audit | `POST /api/liquidity/[action]` (`check-approval`, `create`, `increase`, `decrease`, `claim`, `migrate`, `claim-rewards`) |

**Stable Rumble codes** (inspect `error.code` on `RumbleUniswapError`): `UNISWAP_MISSING_API_KEY`, `UNISWAP_RATE_LIMITED`, `UNISWAP_NO_QUOTE`, `UNISWAP_VALIDATION`, `UNISWAP_UNAUTHORIZED`, `UNISWAP_SERVER_ERROR`, `UNISWAP_GATEWAY_TIMEOUT`, `UNISWAP_NETWORK`, `UNISWAP_UNKNOWN`.

**To-dos:**

- [x] Route Trading **`/check_approval`**, **`/quote`**, **`/swap`**, **`/order`** through **`fetchUniswap`** — `lib/integrations/uniswap/trading.ts`.
- [x] Route Liquidity **`/lp/*`** through **`fetchUniswap`** — `lib/integrations/uniswap/liquidity.ts`.
- [ ] Catch **`RumbleUniswapError`** by **`error.code`** (`UNISWAP_*`) for UI and retries; on **429**, backoff globally for that API key — **never** spin tight loops.
- [ ] Log **`requestId`** from JSON bodies when present (failed responses may include it — see `classifyUniswapHttpFailure`).

---

## 4. Trading API — HTTP status codes & remediation

Sources: [Common errors / Troubleshooting](https://developers.uniswap.org/docs/trading/swapping-api/common-errors); API reference pages list response families including **200, 400, 401, 404, 429, 500, 504** for endpoints such as `check_approval`.

| HTTP | Meaning | Typical causes | What Rumble should do |
|------|---------|----------------|----------------------|
| **200** | Success | — | Parse body; persist `requestId` if returned |
| **400** | Request validation | Missing required fields (e.g. quote params like `autoSlippage`), malformed addresses (e.g. **39** chars instead of **40**), invalid enums | Fix payload; **do not retry** identical body without correction |
| **401** | Unauthorized | Missing/invalid **`x-api-key`**, or invalid header combination | Verify env key; fix **Accept** / **Content-Type** |
| **404** | Often **`No quotes available`** on **`/quote`** | See §4.1 below | Classify; adjust amount/chain/tokens or protocol selection |
| **429** | Rate limited | Exceeded RPS | Back off globally for that key; retry later |
| **500** | Server error | Uniswap-side fault | Retry with backoff; alert if persistent |
| **504** | Gateway timeout | Upstream slow/unavailable | Retry with backoff; shorten timeout only if docs allow |

Successful bodies may include a **`requestId`** string — useful for debugging with Uniswap support.

### 4.1 HTTP 404 — “No quotes available” (quote endpoint)

Per official docs, this is often **not** “no route exists” but a validation / eligibility issue. Common reasons (most frequent first):

1. **Amount too low for UniswapX** — Minimum **~1,000 USDC equivalent on L2** (includes **Base**, Arbitrum, etc.) and **~300 USDC equivalent on Ethereum Mainnet**. Below threshold → no quote. See [UniswapX chain support](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains#uniswapx-chain-support).
2. **Chain not supported** by the routing mode you requested (UniswapX has **limited** chain coverage).
3. **Token addresses don’t match the chain** — e.g. Mainnet USDC address pasted for Base (addresses are **per-chain**).
4. **Invalid combined bridge + swap** — API supports **either** a bridge (cross-chain, same token) **or** a same-chain swap, **not** both in one combined request.

**Rumble:** Map agent “arena pools” to **verified** `(chainId, token0, token1, fee)` before quoting; enforce **minimum notional** in UI/backend when UniswapX is in `protocols`.

---

## 5. Liquidity provisioning API — flows, pools, positions

Docs: [Managing liquidity via the Uniswap API](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started), [LP integration guide](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/integration-guide).

### 5.1 High-level message flow (official)

1. **Approvals** — [`check_approval_lp`](https://developers.uniswap.org/docs/api-reference/check_approval_lp) (or current name in API reference): verify Permit2 / allowance for tokens going to the pool; sign returned transactions if missing.
2. **Create position** — [`create_lp_position`](https://developers.uniswap.org/docs/api-reference/create_lp_position):
   - API checks whether the **pool already exists**.
   - If the pool **does not exist**, the response includes a **fully-formed transaction to create the pool** — user/agent signs it (“creating pairs” is **not** a separate arbitrary endpoint in this flow; **pool creation is bundled** when needed).
   - Response also includes the transaction to **mint / add** the position — sign and broadcast in order per docs.
3. **Ongoing management**
   - [**Increase**](https://developers.uniswap.org/docs/api-reference/increase_lp_position) — add liquidity to an existing NFT position.
   - [**Decrease**](https://developers.uniswap.org/docs/api-reference/decrease_lp_position) — reduce or exit liquidity.
   - [**Claim** fees](https://developers.uniswap.org/docs/api-reference/claim_lp_fees) — collect accrued fees.
   - [**Migrate**](https://developers.uniswap.org/docs/api-reference/migrate_lp_position) — e.g. V3 → V4 within same pair (when offered).
   - [**Claim rewards**](https://developers.uniswap.org/docs/api-reference/claim_lp_rewards) — incentive programs where applicable.

### 5.2 Liquidity API — errors & operational parity

Uniswap documents **Trading API** errors in detail (above). **Liquidity** endpoints share the same platform (**x-api-key**, JSON headers). Expect analogous patterns:

| Expectation | Notes |
|-------------|--------|
| **400** | Invalid body — wrong `protocol` (V2/V3/V4), bad tick range, missing `nft_token_id` for V3/V4 increases, etc. Read response message and fix schema. |
| **401** | Same as Trading API — key / headers. |
| **429** | Respect global **6 RPS** budget across **both** Trading and Liquidity calls unless Uniswap provisions separate limits (confirm in dashboard). |
| **500 / 504** | Retry with backoff; pool simulation may be heavy. |

Always cross-check **response schemas** in the latest [API reference](https://developers.uniswap.org/docs/api-reference) for LP-specific fields (`simulateTransaction`, signatures for V4 permits, etc.).

---

## 6. Rumble error-handling checklist (implement in code)

- [ ] Map HTTP status → stable **internal error codes** for Mongo logging (`UNISWAP_RATE_LIMIT`, `UNISWAP_NO_QUOTE`, `UNISWAP_VALIDATION`, …).
- [ ] Never log full **`x-api-key`**.
- [ ] Persist **`requestId`** + agent id + raw safe excerpt for failed quotes (debugging).
- [ ] User-facing copy for **404 quote**: distinguish “amount too small for UniswapX” vs “wrong chain/token address” where API message allows.

---

## 7. Official links (bookmark)

- [Swapping API — Troubleshooting](https://developers.uniswap.org/docs/trading/swapping-api/common-errors)
- [Swapping API — Getting started](https://developers.uniswap.org/docs/trading/swapping-api/getting-started)
- [Liquidity API — Getting started](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/getting-started)
- [API reference index](https://developers.uniswap.org/docs/api-reference)
- [Supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains)

---

*This file is maintained for Rumble backend planning; it is not an official Uniswap publication.*
