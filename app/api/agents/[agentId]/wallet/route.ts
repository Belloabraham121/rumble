import { NextResponse } from "next/server"
import { fetchAgentWalletBalances } from "@/lib/onchain/agent-wallet-balances"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { findAgentWallet } from "@/lib/db/agent-wallets.repo"
import { getUserByRomboUserIdHex } from "@/lib/db/users.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { chainIdFromSlug } from "@/lib/rombo/chain-config"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  if (!identity?.romboUserIdHex) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { agentId } = await ctx.params
  const agent = await findAgentForUser(identity.romboUserIdHex, agentId)
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const chainId = chainIdFromSlug(agent.config.chain) ?? env.defaultChainId

  /**
   * Funding wallet displayed in the agent capsule must match the wallet the
   * runtime tick actually signs from — i.e. the user's Privy embedded wallet
   * (same address shown in the dashboard navbar). Fall back to the legacy
   * per-agent wallet only if the embedded bridge has not populated yet.
   */
  const user = await getUserByRomboUserIdHex(identity.romboUserIdHex)
  let address: string | null = user?.privyEmbeddedWalletAddress ?? null
  if (!address) {
    const wallet = await findAgentWallet(identity.romboUserIdHex, agentId)
    address = wallet?.address ?? null
  }

  if (!address) {
    return NextResponse.json({
      address: null as string | null,
      chainId,
      balanceEth: null as string | null,
      balanceUsdc: null as string | null,
    })
  }

  try {
    const balances = await fetchAgentWalletBalances({
      chainId,
      walletAddress: address,
    })
    return NextResponse.json({
      address,
      chainId,
      balanceEth: balances.balanceEth,
      balanceUsdc: balances.balanceUsdc,
    })
  } catch {
    return NextResponse.json({
      address,
      chainId,
      balanceEth: null as string | null,
      balanceUsdc: null as string | null,
      error: "balance_fetch_failed",
    })
  }
}
