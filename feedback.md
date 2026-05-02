---

### 2. `FEEDBACK.md` (Required for Uniswap Prize)

```markdown
# Uniswap API + Developer Platform Feedback

**Project**: Rumble  
**Team**: [Your Names]  
**Date**: May 2026

## What Worked Great

- The Uniswap AI skills (`npx skills add Uniswap/uniswap-ai`) made integration incredibly fast. Installing `uniswap-trading` and `uniswap-viem` plugins let us add swap + liquidity tools to our agent in minutes.
- Trading API quotes are fast and accurate. Universal Router execution worked flawlessly on testnet.
- LP endpoints (add/remove liquidity) were recently added — huge help for our box-triggered liquidity features.
- Documentation and workshop video were excellent for quick onboarding.

## What Could Be Improved / Missing

- More examples of multi-step agent flows (quote → decide → execute in one prompt).
- Better TypeScript types for complex v4 hook interactions.
- Easier testnet liquidity provisioning for demos (faucet + pool bootstrap guide).
- WebSocket support for real-time price updates directly from the API (we used Subgraph as fallback).
- **No first-class endpoint for chaining multiple actions in one signed transaction.** Every `/swap`, `/lp/create`, `/lp/increase`, `/lp/decrease` call returns one calldata blob and (often) demands one Permit2 signature. For an autonomous agent ticking 3+ pools per cycle, that fans out into N parallel API calls and N user moments. The Universal Router is fully capable of executing a multi-leg command stream — we'd love an API surface that exposes it.

## Bugs / Friction Encountered

- Rate limits occasionally hit during rapid testing — would love higher hackathon-tier limits.
- Minor docs gap on best practices for persistent agent wallets.

## What We Wish Existed

- **A `POST /v1/multi_action` endpoint** — accept an array like `[{ kind: "swap" | "lp_increase" | "lp_decrease", ...args }]` and return **one** Universal Router calldata + **one** batched `v4BatchPermitData` Permit2 signature, with **one** combined quote + slippage envelope. Today, an agent that wants to "swap to rebalance, then add concentrated liquidity in the same range" pays for two `/quote` round-trips, two approvals, and two on-chain txs even though the router could execute it as a single multicall. This single endpoint would simplify our `lib/agents/runtime/tick.ts` materially — drop a whole branch of fan-out + retry plumbing — and turn a per-tick prompt into a once-per-session signature.
- **Batch `/lp/*` for multi-position rebalancing** — when an agent manages five concentrated ranges in one pool, rebalancing means five `/lp/decrease` + five `/lp/increase` calls. The v4 PositionManager natively supports batched modifications; surfacing that on the API would let strategies like "shift all five ranges 1% up" become a single signed action.
- **Conditional execution intents** — basically the UniswapX intent model exposed for arbitrary commands: "execute this swap iff price ≤ X within Y blocks." Today our agents poll and race the clock; we'd happily hand the matching off to the API.
- Built-in agent memory examples for DeFi (tracking IL, range performance).
- One-click "Agent Wallet" abstraction (like smart sessions).
- More pre-built hooks for common strategies (auto-rebalance, dynamic fees).

## Overall DX Score: 9/10

The platform is already agent-friendly. With a few more examples and higher limits, it would be perfect for production autonomous finance agents.

We loved building with Uniswap and are excited to see the ecosystem grow!

**Contact**: [Your Telegram / Email]
```
