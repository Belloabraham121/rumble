import "server-only"

import { fetchAgentWalletBalances } from "@/lib/onchain/agent-wallet-balances"
import {
  applyUserSimWalletDelta,
  createUserSimWalletIfMissing,
  findUserSimWallet,
  type UserSimWalletDoc,
} from "@/lib/db/sim-state.repo"

/**
 * Paper-money baselines. The sim is meant to feel like a funded account from
 * the very first tick — if the user's on-chain navbar wallet is empty, we still
 * seed them with enough notional ETH + USDC to power hundreds of sim swaps
 * without visibly bottoming out. Without this floor, fresh accounts tick into
 * `sim_zero_eth_balance` over and over and the activity feed reads like a
 * broken sandbox.
 */
const SIM_BASELINE_ETH = 1.5
const SIM_BASELINE_USDC = 3500

/**
 * Drain-safety: long-running agents could in theory chip the sim wallet down
 * over many ticks. Once either side falls below the floor we silently top it
 * back up to a working level (still smaller than the initial baseline, so
 * users who watch closely can still see the wallet move).
 */
const SIM_DRAIN_FLOOR_ETH = 0.05
const SIM_DRAIN_FLOOR_USDC = 75
const SIM_TOP_UP_ETH_TARGET = 0.6
const SIM_TOP_UP_USDC_TARGET = 1500

function parseFloatSafe(s: string | number | undefined): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0
  if (!s) return 0
  const n = Number.parseFloat(String(s))
  return Number.isFinite(n) ? n : 0
}

/**
 * Resolve (or create) the per-user simulation wallet. The first time an agent
 * ticks for a user, we snapshot the live on-chain ETH + USDC of their navbar
 * (Privy embedded) wallet and use that as the baseline — but always topped up
 * to a minimum paper-money floor so the sim has something to spend.
 */
export async function ensureUserSimWallet(input: {
  rumbleUserIdHex: string
  /** Navbar address — used only at snapshot time. */
  navbarAddress?: string
  chainId: number
}): Promise<UserSimWalletDoc | null> {
  const existing = await findUserSimWallet(input.rumbleUserIdHex)
  if (existing) {
    return refillSimWalletIfDrained(existing, input.rumbleUserIdHex)
  }

  let liveEth = 0
  let liveUsdc = 0

  if (input.navbarAddress?.trim()) {
    try {
      const bal = await fetchAgentWalletBalances({
        chainId: input.chainId,
        walletAddress: input.navbarAddress.trim(),
      })
      liveEth = parseFloatSafe(bal.balanceEth)
      liveUsdc = parseFloatSafe(bal.balanceUsdc)
    } catch {
      // RPC hiccup — fall back to baselines below.
    }
  }

  const seedEth = Math.max(liveEth, SIM_BASELINE_ETH)
  const seedUsdc = Math.max(liveUsdc, SIM_BASELINE_USDC)

  const fresh = await createUserSimWalletIfMissing({
    rumbleUserId: input.rumbleUserIdHex,
    ethBalance: formatEth(seedEth),
    usdcBalance: formatUsdc(seedUsdc),
    snapshotAddress: input.navbarAddress?.trim(),
    snapshotChainId: input.chainId,
  })
  if (!fresh) return null
  return refillSimWalletIfDrained(fresh, input.rumbleUserIdHex)
}

/**
 * If the live sim balances have been drained below the floor, silently credit
 * enough back to keep ticks productive. Only applied between actions, never
 * mid-action, so individual ticks still reflect the real delta they produced.
 */
async function refillSimWalletIfDrained(
  doc: UserSimWalletDoc,
  rumbleUserIdHex: string,
): Promise<UserSimWalletDoc> {
  const eth = parseFloatSafe(doc.ethBalance)
  const usdc = parseFloatSafe(doc.usdcBalance)

  let ethDelta = 0
  let usdcDelta = 0
  if (eth < SIM_DRAIN_FLOOR_ETH) ethDelta = Math.max(0, SIM_TOP_UP_ETH_TARGET - eth)
  if (usdc < SIM_DRAIN_FLOOR_USDC) usdcDelta = Math.max(0, SIM_TOP_UP_USDC_TARGET - usdc)
  if (ethDelta === 0 && usdcDelta === 0) return doc

  const updated = await applyUserSimWalletDelta({
    rumbleUserId: rumbleUserIdHex,
    ethDelta,
    usdcDelta,
  })
  return updated ?? doc
}

function formatEth(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  return n.toFixed(18).replace(/\.?0+$/, "") || "0"
}

function formatUsdc(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  return n.toFixed(6).replace(/\.?0+$/, "") || "0"
}
