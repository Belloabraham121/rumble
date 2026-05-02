import "server-only"

import type { ObjectId } from "mongodb"
import { COLLECTIONS } from "@/lib/db/collections"
import { getMongoDb } from "@/lib/db/mongo-client"

/**
 * Single shared simulation wallet for a Rombo user. All running agents debit
 * and credit this same row — there is no per-agent wallet in sim mode.
 */
export type UserSimWalletDoc = {
  _id: ObjectId
  rumbleUserId: string
  /** Live decimal-string balances, mutated by every sim action. */
  ethBalance: string
  usdcBalance: string
  /** Frozen on-chain snapshot taken at the first sim tick — never updated. */
  baselineEthBalance: string
  baselineUsdcBalance: string
  /** Sourced from `privyEmbeddedWalletAddress` at snapshot time. */
  snapshotAddress?: string
  snapshotChainId?: number
  snapshottedAt: Date
  updatedAt: Date
}

export async function findUserSimWallet(rumbleUserId: string): Promise<UserSimWalletDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  return db
    .collection<UserSimWalletDoc>(COLLECTIONS.userSimWallets)
    .findOne({ rumbleUserId })
}

/**
 * Create the sim wallet doc only if it does not exist (first-tick snapshot).
 * Returns the document that exists post-call (existing row wins on race).
 */
export async function createUserSimWalletIfMissing(input: {
  rumbleUserId: string
  ethBalance: string
  usdcBalance: string
  snapshotAddress?: string
  snapshotChainId?: number
}): Promise<UserSimWalletDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  const now = new Date()
  await db.collection(COLLECTIONS.userSimWallets).updateOne(
    { rumbleUserId: input.rumbleUserId },
    {
      $setOnInsert: {
        rumbleUserId: input.rumbleUserId,
        ethBalance: input.ethBalance,
        usdcBalance: input.usdcBalance,
        baselineEthBalance: input.ethBalance,
        baselineUsdcBalance: input.usdcBalance,
        snapshotAddress: input.snapshotAddress,
        snapshotChainId: input.snapshotChainId,
        snapshottedAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
  return findUserSimWallet(input.rumbleUserId)
}

/** Apply a delta against the live balances (deltas are decimal strings, may be negative). */
export async function applyUserSimWalletDelta(input: {
  rumbleUserId: string
  ethDelta: number
  usdcDelta: number
}): Promise<UserSimWalletDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  const cur = await findUserSimWallet(input.rumbleUserId)
  if (!cur) return null
  const nextEth = Math.max(0, parseFloatSafe(cur.ethBalance) + input.ethDelta)
  const nextUsdc = Math.max(0, parseFloatSafe(cur.usdcBalance) + input.usdcDelta)
  const now = new Date()
  await db.collection(COLLECTIONS.userSimWallets).updateOne(
    { rumbleUserId: input.rumbleUserId },
    {
      $set: {
        ethBalance: formatDecimal(nextEth, 18),
        usdcBalance: formatDecimal(nextUsdc, 6),
        updatedAt: now,
      },
    },
  )
  return findUserSimWallet(input.rumbleUserId)
}

export type AgentSimLpPositionDoc = {
  _id: ObjectId
  rumbleUserId: string
  agentId: string
  /** `arena:eth-usdc` or `lab:<labPoolId>` — keeps positions separable per pool. */
  poolKey: string
  arenaPoolId?: string
  labPoolId?: string
  /** Decimal strings — total currently locked in this position. */
  ethDeposited: string
  usdcDeposited: string
  chartLow: number
  chartHigh: number
  status: "open" | "closed"
  openedAt: Date
  updatedAt: Date
  closedAt?: Date
}

export async function findOpenLpPositionForAgentPool(input: {
  rumbleUserId: string
  agentId: string
  poolKey: string
}): Promise<AgentSimLpPositionDoc | null> {
  const db = await getMongoDb()
  if (!db) return null
  return db
    .collection<AgentSimLpPositionDoc>(COLLECTIONS.agentSimLpPositions)
    .findOne({
      rumbleUserId: input.rumbleUserId,
      agentId: input.agentId,
      poolKey: input.poolKey,
      status: "open",
    })
}

export async function upsertOpenLpPositionAdd(input: {
  rumbleUserId: string
  agentId: string
  poolKey: string
  arenaPoolId?: string
  labPoolId?: string
  ethDelta: number
  usdcDelta: number
  chartLow: number
  chartHigh: number
}): Promise<void> {
  const db = await getMongoDb()
  if (!db) return
  const now = new Date()
  const cur = await findOpenLpPositionForAgentPool(input)
  if (cur) {
    await db.collection(COLLECTIONS.agentSimLpPositions).updateOne(
      { _id: cur._id },
      {
        $set: {
          ethDeposited: formatDecimal(parseFloatSafe(cur.ethDeposited) + input.ethDelta, 18),
          usdcDeposited: formatDecimal(parseFloatSafe(cur.usdcDeposited) + input.usdcDelta, 6),
          chartLow: input.chartLow,
          chartHigh: input.chartHigh,
          updatedAt: now,
        },
      },
    )
    return
  }
  await db.collection(COLLECTIONS.agentSimLpPositions).insertOne({
    rumbleUserId: input.rumbleUserId,
    agentId: input.agentId,
    poolKey: input.poolKey,
    arenaPoolId: input.arenaPoolId,
    labPoolId: input.labPoolId,
    ethDeposited: formatDecimal(input.ethDelta, 18),
    usdcDeposited: formatDecimal(input.usdcDelta, 6),
    chartLow: input.chartLow,
    chartHigh: input.chartHigh,
    status: "open",
    openedAt: now,
    updatedAt: now,
  } as unknown as AgentSimLpPositionDoc)
}

/**
 * Reduce an open LP position by `percent` (1–100). Returns the *withdrawn*
 * deposits so the simulator can credit the user wallet (after applying the
 * stochastic fee/IL multiplier on top).
 */
export async function reduceOpenLpPosition(input: {
  rumbleUserId: string
  agentId: string
  poolKey: string
  percent: number
}): Promise<{ ethWithdrawn: number; usdcWithdrawn: number; closed: boolean } | null> {
  const db = await getMongoDb()
  if (!db) return null
  const cur = await findOpenLpPositionForAgentPool(input)
  if (!cur) return null
  const pct = Math.min(100, Math.max(1, Math.round(input.percent)))
  const ethCur = parseFloatSafe(cur.ethDeposited)
  const usdcCur = parseFloatSafe(cur.usdcDeposited)
  const ethOut = (ethCur * pct) / 100
  const usdcOut = (usdcCur * pct) / 100
  const ethRem = Math.max(0, ethCur - ethOut)
  const usdcRem = Math.max(0, usdcCur - usdcOut)
  const closed = pct >= 100 || (ethRem <= 1e-12 && usdcRem <= 1e-12)
  const now = new Date()
  if (closed) {
    await db.collection(COLLECTIONS.agentSimLpPositions).updateOne(
      { _id: cur._id },
      {
        $set: {
          ethDeposited: formatDecimal(0, 18),
          usdcDeposited: formatDecimal(0, 6),
          status: "closed",
          closedAt: now,
          updatedAt: now,
        },
      },
    )
  } else {
    await db.collection(COLLECTIONS.agentSimLpPositions).updateOne(
      { _id: cur._id },
      {
        $set: {
          ethDeposited: formatDecimal(ethRem, 18),
          usdcDeposited: formatDecimal(usdcRem, 6),
          updatedAt: now,
        },
      },
    )
  }
  return { ethWithdrawn: ethOut, usdcWithdrawn: usdcOut, closed }
}

function parseFloatSafe(s: string | number | undefined): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0
  if (!s) return 0
  const n = Number.parseFloat(String(s))
  return Number.isFinite(n) ? n : 0
}

/** Cap precision to avoid stringy floating-point garbage in Mongo. */
function formatDecimal(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "0"
  if (value <= 0) return "0"
  const fixed = value.toFixed(Math.min(18, Math.max(0, maxDecimals)))
  return fixed.replace(/\.?0+$/, "") || "0"
}
