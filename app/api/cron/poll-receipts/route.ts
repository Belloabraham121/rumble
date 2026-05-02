import { NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/api/cron-auth"
import { pollPendingTradingReceipts } from "@/lib/indexer/poll-receipt"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

async function run(req: Request) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json({ error: "MongoDB is not configured." }, { status: 503 })
  }

  const summary = await pollPendingTradingReceipts()

  return NextResponse.json({
    ok: true,
    ...summary,
    ranAt: new Date().toISOString(),
  })
}

export const GET = run
export const POST = run
