# Rombo – Boxes Implementation Guide

**Project**: Rombo – Autonomous Uniswap Agent Arena  
**Version**: 1.1 (ETHGlobal Open Agents 2026)

## What Are Boxes?

**Boxes** are the core mechanic of Rombo.

A **box** is a **price band** `[low, high]` on the live chart **plus** an **action** the agent should take when spot enters that band. The band is stored in the **same coordinate space** as the chart (aligned with how spot USD maps into coordinates — see `chartCoordFromUsd` / pool sim in code).

A box is **not** only “add liquidity between two prices.” Depending on `action`, it can mean:

| Action               | What the box represents (conceptually)                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **swap**             | _If price is in this band at trigger time, execute a swap_ sized by policy — edge comes from **timing**, route, pool fees, and slippage.                            |
| **add_liquidity**    | _If price enters this band, deploy liquidity in that range_ — edge comes from **fee capture** while price stays in range, fee tier, and competition from other LPs. |
| **remove_liquidity** | _If price enters this band, trim or exit a position_ — edge comes from **risk off**, IL reduction, or reallocating capital.                                         |

So one visual rectangle can encode **different economic intents**: “profit from a swap here,” “profit from LP fees here,” “protect capital here.” The dashboard still shows **arrow hits box → execution** for all of them.

## Multipliers (why one box says 1.2x and another 2.0x)

**Different boxes should carry different multipliers** because they imply **different risk, capital intensity, and expected reward** — not every band is equally attractive once **real pool activity** is considered.

### Design principle (product + economics)

- Multipliers should reflect **reward potential conditioned on live market structure**, not only “narrow band = big number” in isolation.
- **Authoritative inputs** include:
  - **Band geometry**: width of `[low, high]` vs spot (same coordinate system as quote).
  - **Pool identity**: fee tier, pair — same geometric width has **different economics** on 0.01% vs 0.05% vs 0.3% pools.
  - **Market data (subgraph / indexing)**: volume, fees, liquidity, tick / price proximity — **activity in and around the pool** informs whether a band is likely to earn fees or capture swap edge **now**.
  - **Guards**: caps, minimum observation windows, gas-aware dampeners so extremes don’t create unlimited liability for the product.

So: **subgraph-backed signals are the right place to ground multipliers** — fills, pool aggregates, and (where the schema allows) tick- or time-windowed stats — combined with **your box definition** and **fee tier truth** (label + on-chain pool metadata where verified).

Geometry-only scores are useful for **UX consistency** early on; **economically grounded** scores use **pool + subgraph** so the arena isn’t mispriced vs actual flow.

### Connection to Uniswap v3 intuition

- **Concentrated liquidity**: tighter **correctly placed** ranges can earn more fees **per unit of capital** _when volume crosses that range_.
- That only holds if **trades actually hit your ticks** — hence volume / activity matter as much as narrow width.

### Example (illustrative)

Pool ETH/USDC, 0.05% tier:

- **Box A** (wide band, quiet subgraph window): lower multiplier — safer, less fee throughput expected.
- **Box B** (tighter band **and** strong recent volume near current tick): higher multiplier — higher **conditional** fee yield story.

Exact numbers come from your **formula + caps**, fed by subgraph aggregates and band mapping — not from a single fixed table.

## How Boxes Are Implemented (Technical Details)

### 1. Box data shape (agent memory / Mongo)

Persisted boxes align with the dashboard schema (`PriceBox`): `low`, `high`, `action`, `amountPercent`, labels, etc. Optional persisted `multiplier` may be denormalized for display; **authoritative** runtime multipliers may be **recomputed** when resolving a tick using **spot + pool + subgraph inputs**.

```json
{
  "boxId": "box_8f2k",
  "agentId": "agent_7f9k",
  "version": "1.1.0",
  "low": 2480.5,
  "high": 2520.75,
  "action": "add_liquidity",
  "amountPercent": 35,
  "multiplier": 3.2,
  "status": "active",
  "createdAt": "2026-05-02T21:00:00Z",
  "reason": "tight band with high recent volume near spot (see subgraph window)"
}
```
