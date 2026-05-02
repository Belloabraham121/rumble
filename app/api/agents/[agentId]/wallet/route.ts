import { NextResponse } from "next/server"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { findUserSimWallet } from "@/lib/db/sim-state.repo"
import { ensureUserSimWallet } from "@/lib/agents/runtime/sim-snapshot"
import { getUserByRumbleUserIdHex } from "@/lib/db/users.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { chainIdFromSlug } from "@/lib/rumble/chain-config"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

/**
 * Funding wallet shown in the agent capsule. Sim mode: this returns the
 * shared `user_sim_wallets` row — the same paper-money balances the runtime
 * mutates on every action. The address still echoes the navbar (Privy
 * embedded) wallet so the user sees a consistent identity end-to-end.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.rumbleUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { agentId } = await ctx.params
  const agent = await findAgentForUser(identity.rumbleUserIdHex, agentId)
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const chainId = chainIdFromSlug(agent.config.chain) ?? env.defaultChainId
  const user = await getUserByRumbleUserIdHex(identity.rumbleUserIdHex)
  const navbarAddress = user?.privyEmbeddedWalletAddress

  /**
   * Lazily snapshot the sim wallet on first wallet-API hit so the capsule
   * shows numbers even before the agent has ticked once. Subsequent hits read
   * the persisted row.
   */
  let sim = await findUserSimWallet(identity.rumbleUserIdHex)
  if (!sim) {
    sim = await ensureUserSimWallet({
      rumbleUserIdHex: identity.rumbleUserIdHex,
      navbarAddress,
      chainId,
    })
  }

  return NextResponse.json({
    address: navbarAddress ?? sim?.snapshotAddress ?? null,
    chainId,
    balanceEth: sim?.ethBalance ?? null,
    balanceUsdc: sim?.usdcBalance ?? null,
    baselineEth: sim?.baselineEthBalance ?? null,
    baselineUsdc: sim?.baselineUsdcBalance ?? null,
  })
}
