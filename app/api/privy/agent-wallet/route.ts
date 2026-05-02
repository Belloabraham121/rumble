import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { getUserByEmail, upsertUserByEmail } from "@/lib/db/users.repo"
import { ensureAgentPrivyWallet } from "@/lib/integrations/privy/agent-wallet"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export async function POST(req: Request) {
  const env = getRumbleServerEnv()
  if (!env.hasMongo) {
    return NextResponse.json(
      { error: "Agent wallets require MONGODB_URI for durable mapping." },
      { status: 503 },
    )
  }
  if (!env.hasPrivyApp || !env.hasPrivyWalletAuthz) {
    return NextResponse.json(
      { error: "Privy app credentials and PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY are required." },
      { status: 503 },
    )
  }

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const agentId =
    typeof body === "object" && body && "agentId" in body
      ? String((body as { agentId: unknown }).agentId ?? "").trim()
      : ""
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 })
  }

  let user = await getUserByEmail(session.email)
  if (!user) {
    user = await upsertUserByEmail(session.email)
  }
  if (!user) {
    return NextResponse.json({ error: "Could not resolve user record." }, { status: 500 })
  }

  if (!user.privyUserId) {
    return NextResponse.json(
      {
        error:
          "Privy user not linked yet. Set PRIVY_APP_ID / PRIVY_APP_SECRET and sign in again so the login bridge can run.",
      },
      { status: 409 },
    )
  }

  try {
    const wallet = await ensureAgentPrivyWallet({
      rumbleUserIdHex: user._id.toHexString(),
      privyUserId: user.privyUserId,
      agentId,
    })
    if (!wallet) {
      return NextResponse.json({ error: "Privy client unavailable." }, { status: 503 })
    }
    return NextResponse.json({
      walletId: wallet.id,
      address: wallet.address,
      agentId,
    })
  } catch (e) {
    console.error("[rumble] agent wallet:", e)
    const message = e instanceof Error ? e.message : "Wallet creation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
