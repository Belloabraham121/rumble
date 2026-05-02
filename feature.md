# Rombo Features Specification

**Project**: Rombo – Autonomous Uniswap Agent Arena  
**Version**: 1.0 (May 2026)  
**Focus**: Pure Uniswap Trading API integration (quotes, swaps, liquidity provisioning) + Subgraph for real-time data. No external AI skill wrappers.

## 1. User Features

### 1.1 Agent Creation & Funding

- User visits dashboard → clicks “Create New Agent”.
- Fills a simple form: Agent name, goal (e.g., “Maximize yield on ETH/USDC with low impermanent loss”), initial capital amount, allowed pools/chains.
- System creates a dedicated testnet wallet for the agent (private key stored encrypted in DB).
- User sends testnet tokens (ETH/USDC/etc.) to the agent’s wallet address via any wallet.
- Once funded, the agent immediately starts its autonomous loop.
- **What happens under the hood**: Backend records agent in DB and launches persistent background process.

### 1.2 Visual Agent Builder

- Simple form + optional graph view where user can drag-and-drop initial price “boxes” (ranges).
- User can define high-level rules in plain text (e.g., “If price drops 5%, swap 30% to stable”).
- These rules are translated into initial boxes stored in the agent’s memory.
- **Output**: Agent starts with 3–5 pre-drawn boxes on the live chart.

## 2. Agent Core Features (Autonomous Senior Trader)

### 2.1 Live Price Monitoring

- Agent queries Uniswap Subgraph (GraphQL) or falls back to Chainlink oracle every 15–30 seconds for real-time price of chosen token pair.
- Stores latest price + timestamp in memory.
- Displays as a live moving line/arrow on the dashboard chart.

### 2.2 Price Box Triggers (Core Gamification Mechanic)

- A “box” = a price range `[low, high]` with an associated action (swap, add liquidity, remove liquidity) and amount/percentage.
- Agent can auto-generate boxes based on its goal (e.g., tight range around current price for concentrated liquidity).
- User can also drag new boxes directly on the chart (updates sent to backend via WebSocket).
- When live price enters or touches a box:
  1. Agent logs the trigger.
  2. Decides exact action (simple rules + optional LLM reflection).
  3. Calls Uniswap Trading API `/quote` to get best route.
  4. Builds and signs transaction via viem.
  5. Submits via `/swap` or liquidity endpoint.
- Visual feedback: Chart flashes, particles fire, log entry appears instantly.

### 2.3 Autonomous Swaps

- Uses Uniswap Trading API endpoints:
  - `POST /quote` → gets optimal route (v3/v4 or UniswapX).
  - `POST /swap` → receives unsigned transaction.
- Agent signs with its private key and broadcasts.
- Supports exact input/output swaps, slippage tolerance, and deadline.
- After execution: polls `/swaps` status until confirmed onchain.

### 2.4 Dynamic Liquidity Provisioning (v3 & v4)

- Full lifecycle using official Uniswap Liquidity Provisioning API:
  - `/approve` → checks and requests token approvals.
  - `/create_position` → creates new concentrated liquidity position (v3) or v4 position.
  - `/increase_position` → adds more liquidity to existing position.
  - `/decrease_position` → removes partial or full liquidity.
  - `/claim_fees` → claims earned fees.
- Agent decides when to add (price in profitable box) or remove (price leaving range or better opportunity elsewhere).
- Tracks position ID and range in memory for future management.

### 2.5 Multi-Pool Gladiating & Rebalancing

- Agent monitors 3–5 pools simultaneously (configurable).
- Can move capital between pools by removing liquidity from one and swapping + adding to another.
- Uses same quote/swap/liquidity flow above.
- Goal: chase highest yield while minimizing impermanent loss.

### 2.6 Persistent Memory & Reflection

- Stores in PostgreSQL:
  - All boxes (with status: active, triggered, completed)
  - Trade history (timestamp, action, amounts, PNL)
  - Position details (liquidity IDs, ranges, fees earned)
  - Simple reflection notes (“This range performed well at volatility X”)
- After every 5–10 actions, agent reviews history and can auto-adjust future boxes.

### 2.7 Guardrails & Safety

- Configurable limits: max gas per tx, max slippage, approved tokens/pools only.
- Emergency pause button from dashboard (stops the tick loop).
- All actions logged with full onchain receipt links.

## 3. Dashboard & Arena Features (Gamified Experience)

### 3.1 Live Price Chart

- Powered by lightweight-charts or Recharts.
- Real-time candlestick or line chart.
- Agent’s boxes rendered as glowing semi-transparent rectangles (color-coded by action type).
- Moving price arrow/line updates every few seconds.
- On box hit → animated explosion + “EXECUTED” overlay.

### 3.2 Real-Time Action Log & PNL

- Scrolling feed: “Box hit → Added 0.5 ETH + 800 USDC liquidity in 0.3% pool”
- Cumulative PNL, gas used, number of actions, win rate.
- “Resource usage” counter (your original idea) — shows how many API calls and transactions the agent made.

### 3.3 Arena Leaderboard

- Shows multiple demo agents competing in the same pools.
- Ranked by PNL, efficiency, or “gladiator score” (actions + profitability).

### 3.4 Replay Mode

- User can pause the live view and replay past 30 minutes of box hits and executions as an animation.

## 4. Technical & Integration Features

### 4.1 Uniswap API Integration (Prize Focus)

- All execution uses official Uniswap Trading API + Liquidity Provisioning API (no custom smart contracts needed).
- Quote → Transaction build → Sign (viem) → Submit flow for every action.
- Subgraph for price/pool data + fallback oracle.
- Supports Uniswap v3 concentrated liquidity and v4 positions out of the box.

### 4.2 Backend Architecture

- Persistent Node.js process runs the agent tick loop (setInterval or LangGraph simple nodes).
- WebSocket server pushes live updates to all connected dashboards.
- Database stores every agent state independently.

### 4.3 Deployment & Scalability

- Frontend: Vercel
- Backend + agents: Railway/Render (one container per agent or shared with process isolation)
- Works 24/7 on testnet during hackathon.

## Success Criteria for Hackathon

- Real onchain swaps and liquidity actions visible on Etherscan/BaseScan/Unichain explorer.
- Beautiful live dashboard where price visibly triggers boxes and executes.
- FEEDBACK.md will detail direct API experience (rate limits, liquidity endpoints, etc.).

This feature set is 100% built on raw Uniswap API endpoints and delivers the exact autonomous + gamified experience you described.

---

**Ready?**  
You now have:

- `README.md` (from earlier)
- `ARCHITECTURE.md`
- `FEATURES.md` (this one)
- `FEEDBACK.md`

Next I can give you:

- The actual code for the agent tick loop (using direct API calls)
- The dashboard chart component with draggable boxes
- Or the full Next.js + backend starter structure

Just tell me what to build first and we keep shipping Rombo! 🦄
