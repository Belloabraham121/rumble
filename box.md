# Rombo – Boxes Implementation Guide

**Project**: Rombo – Autonomous Uniswap Agent Arena  
**Version**: 1.0 (ETHGlobal Open Agents 2026)

## What Are Boxes?

**Boxes** are the core mechanic of Rombo.  
A **box** = a price range `[low, high]` that the agent (or user) defines on the live price chart.

When the live price **hits or enters** a box, the agent automatically triggers a predefined action:

- Swap
- Add liquidity
- Remove liquidity

This creates the gamified “arrow hits box → instant execution” experience you wanted.

## Boxes with Multipliers (Your Question)

**Yes — different boxes can (and should) have different multipliers.**

### What is a Multiplier?

- The **multiplier** is a number (e.g., 1.2x, 1.8x, 3.0x) that represents **how much extra profit/fee yield** the agent expects to earn if the price stays inside that box.
- It is **directly tied to Uniswap v3 concentrated liquidity math**:
  - **Tighter box** (narrow price range) → **higher multiplier** (your capital becomes “thicker” → you earn more fees per dollar deployed).
  - **Wider box** → lower multiplier (safer but less efficient).

This is real Uniswap v3 behavior (not fake gamification):

- Uniswap v3 gives you up to **4000x capital efficiency** compared to v2 when you concentrate liquidity in a tight range.
- Narrower range = higher effective fee multiplier because almost all trading volume in that range uses **your** liquidity.

### How a Multiplier Helps the Agent Make More Profit

When the price hits a box:

1. Agent triggers **addLiquidity** in that exact range.
2. The narrower the box → the higher the multiplier → the more fees the agent earns **per unit of capital** while price stays inside.
3. Result: Same amount of tokens → much higher PNL.

**Example** (ETH/USDC pool, 0.3% fee tier):

- Box A (wide): $2,400 – $2,600 → multiplier ≈ **1.0x** (safe, but low earnings)
- Box B (tight): $2,480 – $2,520 → multiplier ≈ **3.5x** (higher risk, but 3.5× more fees while price is inside)

If price stays in Box B for the same time as Box A, the agent earns **3.5× more trading fees** with the same capital.  
That is how the agent “makes more profit” when price hits a high-multiplier box.

## How Boxes Are Implemented (Technical Details)

### 1. Box Data Structure (Stored in PostgreSQL + Agent Memory)

```json
{
  "boxId": "box_8f2k",
  "agentId": "agent_7f9k",
  "version": "1.1.0",
  "low": 2480.5,
  "high": 2520.75,
  "action": "addLiquidity", // or "swap" or "removeLiquidity"
  "amountPercent": 35, // % of current capital to use
  "multiplier": 3.2, // auto-calculated or user-set
  "status": "active", // active / triggered / completed
  "createdAt": "2026-05-02T21:00:00Z",
  "reason": "tight range around current price"
}
```
