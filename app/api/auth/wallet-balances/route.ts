import { NextResponse } from "next/server"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { chainDisplayName } from "@/lib/rombo/chain-config"
import { fetchAgentWalletBalances } from "@/lib/onchain/agent-wallet-balances"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

/**
 * Native + USDC balances for the signed-in user's Privy embedded wallet on the
 * server's default chain (e.g. Base Sepolia when `ROMBO_TARGET_NETWORK=testnet`).
 */
export async function GET() {
  const profile = await getSessionProfile()
  if (!profile?.embeddedWalletAddress?.trim()) {
    return NextResponse.json({ error: "no_wallet" }, { status: 404 })
  }

  const env = getRomboServerEnv()
  const chainId = env.defaultChainId

  try {
    const balances = await fetchAgentWalletBalances({
      chainId,
      walletAddress: profile.embeddedWalletAddress.trim(),
    })
    return NextResponse.json({
      address: profile.embeddedWalletAddress.trim(),
      chainId,
      chainName: chainDisplayName(chainId),
      balanceEth: balances.balanceEth,
      balanceUsdc: balances.balanceUsdc,
    })
  } catch {
    return NextResponse.json({ error: "balance_fetch_failed", chainId, chainName: chainDisplayName(chainId) }, { status: 502 })
  }
}
