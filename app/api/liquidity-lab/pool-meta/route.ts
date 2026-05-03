import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { refreshPoolPrice } from "@/lib/data/live-pool-tick"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { ARENA_POOL_IDS } from "@/lib/agents/arena-pools"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

function isArenaId(s: string): s is ArenaPoolId {
  return (ARENA_POOL_IDS as readonly string[]).includes(s)
}

/**
 * Resolves WETH/USDC (or other arena) pool address + tick for building LP `create` payloads.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const arenaPoolId = searchParams.get("arenaPoolId") ?? "eth-usdc"
  const chainIdRaw = searchParams.get("chainId")
  const chainId = chainIdRaw ? Number(chainIdRaw) : getRomboServerEnv().defaultChainId

  if (!isArenaId(arenaPoolId) || !Number.isFinite(chainId)) {
    return NextResponse.json({ error: "Invalid arenaPoolId or chainId" }, { status: 400 })
  }

  const refreshed = await refreshPoolPrice(arenaPoolId, chainId)
  if (!refreshed.ok) {
    return NextResponse.json(
      { error: refreshed.reason, arenaPoolId, chainId },
      { status: 502 },
    )
  }

  const doc =
    getRomboServerEnv().hasMongo && refreshed.snapshot.poolAddress
      ? await getPoolPrice({ chainId, arenaPoolId })
      : null

  const poolAddress = doc?.poolAddress ?? refreshed.snapshot.poolAddress
  const tick =
    doc?.tick !== undefined && doc.tick !== null && String(doc.tick).trim() !== ""
      ? String(doc.tick).trim()
      : refreshed.snapshot.tick !== undefined && refreshed.snapshot.tick !== null
        ? String(refreshed.snapshot.tick)
        : null

  return NextResponse.json({
    arenaPoolId,
    chainId,
    poolAddress: poolAddress ?? null,
    tick,
    displayUsd: refreshed.displayUsd,
    token0Symbol: refreshed.snapshot.token0Symbol,
    token1Symbol: refreshed.snapshot.token1Symbol,
  })
}
