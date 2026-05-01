# Rombo – Autonomous Uniswap Agent Arena

**Project Name**: Rombo  
**Tagline**: Your agent gladiates Uniswap liquidity while you sleep. Set boxes. Watch it win.

## Description

**Rombo** is an autonomous trading + liquidity agent for Uniswap.

Users create and fund an agent. The agent autonomously:

- Monitors live prices
- Sets and manages price-range "boxes" (concentrated liquidity zones or triggers)
- Executes real swaps
- Adds/removes liquidity in Uniswap v3/v4 pools
- Rebalances across pools
- Learns from past performance

A beautiful **gamified dashboard** shows a live price chart where a moving arrow hits the agent's glowing boxes → instant onchain action with visual feedback. Agents compete in an "Arena" leaderboard, turning DeFi liquidity management into a watchable gladiator match.

Built with the **Uniswap Trading API** + **Uniswap AI skills**, Rombo demonstrates the future of agentic finance: transparent, composable, and fully onchain execution.

**Live demo video** (record during hackathon): 2–3 min showing agent creation → box setup → live price hit → swap + LP action.

**Deployed on**: Unichain / Base testnet (easy liquidity for demo).

## Features

### Core Agent Capabilities

- **Autonomous Decision Loop** — Runs 24/7, checks price vs boxes every 30–60s
- **Price Box Triggers** — Agent (or user) draws ranges on chart; price hit = automatic swap / add LP / remove LP
- **Dynamic Liquidity Management** — Adds concentrated liquidity in profitable ranges, removes when out of range or better opportunity appears
- **Multi-Pool Gladiating** — Switches between pools (ETH/USDC, WBTC/ETH, etc.) based on yield/opportunity
- **Persistent Memory** — Remembers past trades, impermanent loss patterns, and winning strategies
- **Reflection & Learning** — After each cycle, agent reflects and adjusts future boxes

### Dashboard & Gamification

- Live candlestick / line chart with real-time Uniswap price feed
- Draggable glowing boxes (agent auto-draws + user can edit)
- Animated "arrow" (price line) that triggers fireworks-style execution animations on hits
- Real-time action log + PNL scoreboard
- Agent Arena leaderboard (multiple agents competing in same pools)
- "Win meter" — efficiency, gas used, ROI

### Developer & User Experience

- **Visual Agent Builder** — Simple form + graph editor to define goals ("max yield with low IL")
- **One-Click Deploy** — Fund wallet → agent starts immediately
- **Full Traceability** — Every decision, quote, and onchain tx is logged
- **Guardrails** — Max gas, approved tokens/pools, risk limits

### Technical Highlights (Uniswap Prize Focus)

- Heavy use of **Uniswap Trading API** (quotes, routing, execution)
- Uniswap AI skills/plugins for seamless agent tool-calling
- Support for Uniswap v3 concentrated liquidity + optional v4 hooks
- Real onchain settlement via Universal Router
- Subgraph + WebSocket for live price/pool data

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind + Framer Motion + lightweight-charts
- **Backend & Agent**: Node.js + LangGraph (or simple loop) + Uniswap AI skills
- **Onchain**: viem/wagmi + Uniswap `uniswap-viem` & `uniswap-trading` plugins
- **Data**: Uniswap Subgraph (GraphQL) + Chainlink oracle fallback
- **Database**: PostgreSQL (or SQLite) + pgvector for memory
- **Deployment**: Vercel (frontend) + Railway/Render (backend + persistent agent)
- **Wallet**: Testnet private key per agent (encrypted)

## Architecture Overview

(See full details in `ARCHITECTURE.md` — agent tick loop, Uniswap API flow, WebSocket updates, etc.)

High-level flow:

1. User creates agent + funds testnet wallet
2. Agent starts background tick loop
3. On each tick: fetch price → check boxes → decide action → call Uniswap API → execute tx
4. Dashboard receives live updates via WebSocket
5. All state (boxes, history, PNL) persisted

## How to Run Locally

```bash
# 1. Clone & install
git clone <your-repo>
cd rombo

# 2. Frontend
cd frontend
npm install
npm run dev

# 3. Backend + Agent
cd backend
npm install
cp .env.example .env
# Add: UNISWAP_API_KEY, WALLET_PRIVATE_KEY (testnet), ANTHROPIC_API_KEY (optional for brain)
npm run dev
```
