import { NextResponse } from "next/server"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { findAgentWallet } from "@/lib/db/agent-wallets.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { CHAIN_OPTIONS } from "@/lib/agents/agent-types"
import { chainIdFromSlug } from "@/lib/rombo/chain-config"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

export async function POST(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
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

  const chainSlug = agent.config.chain
  const chainId = chainIdFromSlug(chainSlug) ?? env.defaultChainId
  const chainLabel = CHAIN_OPTIONS.find(c => c.value === chainSlug)?.label ?? chainSlug
  const wallet = await findAgentWallet(identity.romboUserIdHex, agentId)

  return NextResponse.json({
    depositAddress: wallet?.address ?? null,
    chainId,
    chainLabel,
    recommendedNetwork: `${chainLabel} — send native ETH for gas and USDC for swaps.`,
  })
}
