import { NextResponse } from "next/server"
import { getSessionProfile } from "@/lib/auth/session-profile"

export async function GET() {
  const profile = await getSessionProfile()
  if (!profile) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({
    user: {
      email: profile.email,
      rumbleUserIdHex: profile.rumbleUserIdHex,
      embeddedWalletAddress: profile.embeddedWalletAddress,
    },
  })
}
