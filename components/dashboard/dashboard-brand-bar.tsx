"use client"

import Link from "next/link"
import { SignOutButton } from "@/components/dashboard/sign-out-button"

type Crumb = { label: string; href?: string }

type Props = {
  userEmail?: string | null
  crumbs?: Crumb[]
}

export function DashboardBrandBar({ userEmail, crumbs }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-black/[0.06] bg-[#F5F4F0]/85 backdrop-blur-md">
      <Link
        href="/dashboard"
        className="font-pixel text-xs tracking-[0.25em] text-black/70 hover:text-black transition-colors px-3 py-2 rounded-xl border border-black/10 bg-white shadow-[0_6px_24px_rgba(0,0,0,0.05)]"
      >
        ROMBO
      </Link>

      <nav className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden text-[11px] text-black/50">
        {(crumbs ?? [{ label: "Agents" }]).map((c, i) => {
          const last = i === (crumbs?.length ?? 1) - 1
          return (
            <span key={`${c.label}-${i}`} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span className="text-black/25">/</span>}
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-black transition-colors truncate tracking-wide">
                  {c.label}
                </Link>
              ) : (
                <span className={`truncate tracking-wide ${last ? "text-black/80" : ""}`}>{c.label}</span>
              )}
            </span>
          )
        })}
      </nav>

      <div className="shrink-0 flex items-center gap-3">
        {userEmail && (
          <span className="hidden sm:inline text-[11px] text-black/45 truncate max-w-[180px]" title={userEmail}>
            {userEmail}
          </span>
        )}
        <SignOutButton />
      </div>
    </div>
  )
}
