"use client"

import Link from "next/link"
import type { ReactNode } from "react"

const BAR_STYLE = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  background: "rgba(245,244,240,0.30)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)",
} as const

type SiteHeaderProps = {
  /** Right-side actions (sign out, dashboard link, etc.) */
  right?: ReactNode
  /** Show primary CTA to start building / auth */
  showStartCta?: boolean
}

/** Glass nav bar aligned with `MobileNav` on the landing page. */
export function SiteHeader({ right, showStartCta = false }: SiteHeaderProps) {
  return (
    <header className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <nav
        className="pointer-events-auto flex w-full max-w-3xl items-center justify-between px-5 py-3 rounded-2xl border border-black/[0.06]"
        style={BAR_STYLE}
      >
        <Link
          href="/"
          className="font-pixel text-xs tracking-[0.25em] text-black/70 hover:text-black transition-colors"
        >
          ROMBO
        </Link>

        <div className="flex items-center gap-3">
          {right}
          {showStartCta && (
            <Link
              href="/auth"
              className="text-[11px] px-4 py-2 rounded-xl border border-black/10 text-black/60 hover:text-black hover:border-black/20 hover:bg-black/[0.03] transition-all duration-200 tracking-wide"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              START BUILDING
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
