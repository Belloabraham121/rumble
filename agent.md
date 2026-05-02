# Rombo – Full Project Specification

**Project Name**: Rombo  
**Tagline**: Your senior autonomous agent gladiates Uniswap liquidity. Set boxes. Watch it win.  
**Hackathon**: ETHGlobal Open Agents 2026 – Uniswap Foundation Track  
**Core Tech**: Direct Uniswap Trading API + Liquidity Provisioning API (quotes, swaps, add/remove liquidity)

## 1. Project Overview

Rombo is an autonomous senior trading + liquidity agent for Uniswap.  
Users create and fund an agent. The agent monitors prices, manages price-range "boxes", executes real swaps and concentrated liquidity actions on Uniswap, and evolves over time.

**Key Differentiator**: Beautiful gamified dashboard where a live price arrow hits agent-drawn boxes → instant onchain execution with visual feedback.

## 2. How Agents Are Created

### User Flow

1. Dashboard → "Create New Agent"
2. Fill form:
   - Name
   - Goal (plain text, e.g. "Maximize yield on ETH/USDC with low IL")
   - Risk Level (Conservative / Balanced / Aggressive)
   - Base Pair & Allowed Pools
   - Initial Capital target
3. System creates agent record + dedicated testnet wallet.
4. User funds the wallet address.
5. Agent immediately starts its autonomous tick loop.

### Backend Creation

- Stores config in mongo.
- Launches background worker with the agent ID.
- Initial boxes auto-generated based on risk level + current price from Uniswap Subgraph.

## 3. Agent Versioning

- Semantic versioning (`major.minor.patch`).
- Starts at `1.0.0`.
- After reflection cycles (every 20–50 trades or daily), if improvements are suggested, creates new version (e.g. `1.1.0`).
- Old versions archived — user can rollback via dashboard.
- Version history shows performance replay.

## 4. Full Agent Configuration

### Creation-Time Config (Form)

- Goal / Strategy text
- Risk Level
- Base trading pair + fee tiers
- Chains (Unichain, Base, etc.)
- Guardrail defaults (max slippage, max gas, max position %)

### Runtime Config (Editable while running)

- Price Boxes: `{low, high, action: "swap"|"addLiquidity"|"removeLiquidity", amountPercent}`
- Guardrails: max slippage, max gas, approved tokens/pools
- Reflection frequency & depth

### Price Data Sources

- **Primary**: Uniswap Subgraph GraphQL (`token0Price`, `token1Price`, pool data) — polled every 15–30s.
- **Execution Quotes**: Direct `/quote` from Uniswap Trading API.
- **Fallback**: Chainlink oracle on high-value actions.

### LLM / Reasoning Layer (Optional but Recommended)

- Used only for reflection (not every tick).
- System Prompt example:
