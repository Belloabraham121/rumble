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

## Bugs / Friction Encountered

- Rate limits occasionally hit during rapid testing — would love higher hackathon-tier limits.
- Minor docs gap on best practices for persistent agent wallets.

## What We Wish Existed

- Built-in agent memory examples for DeFi (tracking IL, range performance).
- One-click "Agent Wallet" abstraction (like smart sessions).
- More pre-built hooks for common strategies (auto-rebalance, dynamic fees).

## Overall DX Score: 9/10

The platform is already agent-friendly. With a few more examples and higher limits, it would be perfect for production autonomous finance agents.

We loved building with Uniswap and are excited to see the ecosystem grow!

**Contact**: [Your Telegram / Email]
```
