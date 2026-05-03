import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { listLabPoolsForUser } from "@/lib/db/lab-pools.repo"
import { getUserByEmail } from "@/lib/db/users.repo"
import type { LabPoolDef } from "@/lib/agents/lab-pools"

/**
 * Returns the list of `LabPoolDef`s the current user has registered (one per
 * successful v4 new-pool create from the Liquidity Lab). Used by the agent
 * config UI to offer the "Lab pools" multi-select.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await getUserByEmail(session.email)
  if (!user) {
    return NextResponse.json({ pools: [] as LabPoolDef[] })
  }

  const docs = await listLabPoolsForUser(user._id.toHexString())
  const pools: LabPoolDef[] = docs.map(d => ({
    labPoolId: d.labPoolId,
    chainSlug: d.chainSlug,
    chainId: d.chainId,
    protocol: "V4",
    fee: d.fee,
    tickSpacing: d.tickSpacing,
    hooks: d.hooks,
    token0: d.token0,
    token1: d.token1,
    v4PoolId: d.v4PoolId,
    label: d.label,
  }))

  return NextResponse.json({ pools })
}
