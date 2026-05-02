import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth/constants"
import { decodeSession } from "@/lib/auth/session"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/auth") {
    const token = request.cookies.get(SESSION_COOKIE)?.value
    if (decodeSession(token)) {
      const nextPath = request.nextUrl.searchParams.get("next") || "/dashboard"
      return NextResponse.redirect(new URL(nextPath, request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(SESSION_COOKIE)?.value
    if (!decodeSession(token)) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth"
      url.searchParams.set("next", pathname + request.nextUrl.search)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
}
