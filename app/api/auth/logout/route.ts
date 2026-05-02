import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth/constants"

export async function POST() {
  const res = NextResponse.json({ ok: true as const })
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}
