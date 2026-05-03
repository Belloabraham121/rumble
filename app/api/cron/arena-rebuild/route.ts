import { NextResponse } from "next/server"
import { rebuildAllArenaLeaderboards } from "@/lib/arena/leaderboard"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

async function run(req: Request) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const results = await rebuildAllArenaLeaderboards({ metricsRange: "30d" })

  return NextResponse.json({
    ok: true,
    results,
    ranAt: new Date().toISOString(),
  })
}

export const GET = run
export const POST = run
