import "server-only"

import { getSession } from "@/lib/auth/session"
import { getUserByEmail } from "@/lib/db/users.repo"

export type SessionProfile = {
  email: string
  romboUserIdHex?: string
  embeddedWalletAddress?: string
}

/** Session cookie + Mongo user row (wallet ids after Privy bridge). */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const session = await getSession()
  if (!session) return null

  const row = await getUserByEmail(session.email)
  return {
    email: session.email,
    romboUserIdHex: row?._id.toHexString(),
    embeddedWalletAddress: row?.privyEmbeddedWalletAddress,
  }
}
