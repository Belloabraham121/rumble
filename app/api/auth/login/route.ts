import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth/constants"
import { encodeSession, type SessionUser } from "@/lib/auth/session"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body === "object" && body && "email" in body ? String((body as { email: unknown }).email ?? "").trim() : ""
  const password =
    typeof body === "object" && body && "password" in body ? String((body as { password: unknown }).password ?? "") : ""

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
  }

  const user: SessionUser = { email }
  const token = encodeSession(user)

  const res = NextResponse.json({ ok: true as const, user })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
