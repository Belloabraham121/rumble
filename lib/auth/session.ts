import { cookies } from "next/headers"
import { SESSION_COOKIE } from "@/lib/auth/constants"

export { SESSION_COOKIE }

export type SessionUser = { email: string }

export function encodeSession(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url")
}

export function decodeSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null
  try {
    const j = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as unknown
    if (j && typeof j === "object" && "email" in j && typeof (j as { email: string }).email === "string") {
      const email = (j as { email: string }).email.trim()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email }
    }
    return null
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  return decodeSession(jar.get(SESSION_COOKIE)?.value)
}
