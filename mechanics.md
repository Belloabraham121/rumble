# Rombo Arena – Agent Competition Mechanics

**Project**: Rombo – Autonomous Uniswap Agent Arena

## What is the Arena?

The Arena is the gamified competition layer of Rombo. Multiple agents (yours + demo ones) run simultaneously and compete for the best performance across Uniswap pools.

**Core Idea**: Agents are liquidity gladiators. They fight for yield by strategically adding/removing liquidity and swapping between pools. The best agent (highest PNL, efficiency, or "gladiator score") wins the round/leaderboard.

## How Competition Works

### 1. Shared Environment

- All agents operate in the **same testnet environment** (e.g., Unichain or Base).
- They can access the **same set of pools** (e.g., ETH/USDC 0.3%, WBTC/ETH 0.05%, USDC/USDT, etc.).
- Real-time price feeds are shared (Uniswap Subgraph) so everyone sees the same market.

### 2. Multi-Pool Gladiating (Your Suggestion)

Yes — agents compete by **moving capital across different pairs/pools** to chase optimal yield.

**What an agent can do in the Arena**:

- **Add liquidity** in a pool when price enters a profitable box/range.
- **Remove liquidity** when price leaves the range or better opportunity appears elsewhere.
- **Swap** between pools (e.g., sell ETH for USDC in one pool, then add liquidity in a USDC/USDT pool).
- Rebalance capital dynamically to the highest-yielding pool at any moment.

**Example Competition Round** (30–60 minutes live demo):

- Pool A (ETH/USDC): Agent A adds tight liquidity and earns high fees.
- Pool B (WBTC/ETH): Agent B removes liquidity early to avoid IL and swaps profits into Pool C.
- Winner = agent with highest net PNL + lowest gas waste + most efficient box usage.

### 3. Scoring & Leaderboard

- **PNL** (profit & loss, including fees earned minus IL/gas)
- **Efficiency Score** (actions per gas unit, success rate of box triggers)
- **Gladiator Score** = PNL × efficiency multiplier
- Live leaderboard on dashboard shows ranking in real time.

### 4. How Agents Execute Actions (Direct Uniswap API)

All actions use official Uniswap endpoints (no plugins):

- **Price monitoring**: Subgraph GraphQL (`token0Price`, pool data)
- **Swaps**: `/quote` → `/swap`
- **Liquidity**:
  - `/approve` → check/approve tokens
  - `/create_position` or `/increase_position` → add liquidity
  - `/decrease_position` → remove liquidity
  - `/claim_fees` → collect fees

Agents decide timing based on:

- Their own boxes
- Reflection on recent performance
- Cross-pool comparison (e.g., "Pool B has 2x higher fees right now")

### 5. Arena Modes for Demo / Hackathon

- **Solo Mode**: Your single agent vs simulated market.
- **Competition Mode**: 3–5 agents (yours + demo bots) running live.
- **Replay Mode**: Watch past rounds with animated box hits and executions.

### 6. Why This Works Great for the Prize

- Heavy real usage of Uniswap Trading API + Liquidity Provisioning API.
- Demonstrates composability (agents coordinating across pools via swaps + LP actions).
- Visual + engaging demo (watch agents "fight" on the chart).
- Easy to show evolution (versioned agents improving their multi-pool strategy).

This Arena design makes Rombo feel alive and competitive while staying 100% on top of Uniswap liquidity.

---

Add this file to your repo alongside the others. It perfectly matches the multi-pool competition idea you described.

**Next steps?**  
I can now give you:

- Code for the multi-pool decision logic in the agent tick loop
- How to implement the leaderboard
- Or the full set of API call wrappers (`swap.ts`, `addLiquidity.ts`, etc.)

Just tell me what to build first and we’ll finish the project! 🦄
