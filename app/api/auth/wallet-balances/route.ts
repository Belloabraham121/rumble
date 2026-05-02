import { NextResponse } from "next/server"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { chainDisplayName } from "@/lib/rumble/chain-config"
import { findUserSimWallet } from "@/lib/db/sim-state.repo"
import { ensureUserSimWallet } from "@/lib/agents/runtime/sim-snapshot"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

/**
 * Navbar balance pill — returns the user's *simulated* ETH + USDC. Sim mode is
 * the only mode, and the shared sim wallet is mutated by every running agent
 * tick, so this number ticks live as the agents play. Snapshot is taken
 * lazily here too so the navbar shows numbers immediately on first dashboard
 * load even before any agent runs.
 */
export async function GET() {
  const profile = await getSessionProfile()
  if (!profile?.rumbleUserIdHex) {
    return NextResponse.json({ error: "no_user" }, { status: 404 })
  }

  const env = getRumbleServerEnv()
  const chainId = env.defaultChainId

  let sim = await findUserSimWallet(profile.rumbleUserIdHex)
  if (!sim) {
    sim = await ensureUserSimWallet({
      rumbleUserIdHex: profile.rumbleUserIdHex,
      navbarAddress: profile.embeddedWalletAddress,
      chainId,
    })
  }

  if (!sim) {
    return NextResponse.json({ error: "no_sim_wallet", chainId, chainName: chainDisplayName(chainId) }, { status: 502 })
  }

  return NextResponse.json({
    address: profile.embeddedWalletAddress ?? sim.snapshotAddress ?? null,
    chainId,
    chainName: chainDisplayName(chainId),
    balanceEth: sim.ethBalance,
    balanceUsdc: sim.usdcBalance,
    baselineEth: sim.baselineEthBalance,
    baselineUsdc: sim.baselineUsdcBalance,
  })
}
