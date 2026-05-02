import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { PillTag } from "@/components/brand/pill-tag"
import { SignOutButton } from "@/components/dashboard/sign-out-button"
import { GlassCard } from "@/components/layout/glass-card"
import { SitePageShell } from "@/components/layout/site-page-shell"
import { SiteHeader } from "@/components/layout/site-header"

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) redirect("/auth?next=/dashboard")

  return (
    <SitePageShell>
      <SiteHeader
        right={
          <>
            <span
              className="text-[11px] text-black/45 tracking-wide max-w-[180px] sm:max-w-[260px] truncate hidden sm:inline"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              title={user.email}
            >
              {user.email}
            </span>
            <SignOutButton />
          </>
        }
      />

      <main className="pt-28 pb-20 px-6 md:px-12 lg:px-20">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 md:mb-16">
            <PillTag>DASHBOARD</PillTag>
            <h1
              className="mt-4 text-4xl md:text-5xl lg:text-6xl font-light tracking-tight text-[#111] leading-[1.05]"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              Agent command center
            </h1>
            <p className="mt-4 text-sm md:text-base text-black/45 max-w-xl leading-relaxed">
              Orchestrate Uniswap agents, box triggers, and liquidity moves from one surface—wired for Trading API and plugins next.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <GlassCard className="p-6 md:p-8 flex flex-col justify-between min-h-[160px] hover:border-black/[0.12] transition-colors">
              <div>
                <p className="text-[11px] tracking-widest text-black/35 uppercase mb-2">Active agents</p>
                <p className="text-3xl md:text-4xl font-light text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
                  —
                </p>
              </div>
              <span className="text-xs text-black/30 tracking-wide">Connect wallets & deploy</span>
            </GlassCard>

            <GlassCard className="p-6 md:p-8 flex flex-col justify-between min-h-[160px] hover:border-black/[0.12] transition-colors">
              <div>
                <p className="text-[11px] tracking-widest text-black/35 uppercase mb-2">Box triggers (24h)</p>
                <p className="text-3xl md:text-4xl font-light text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
                  —
                </p>
              </div>
              <span className="text-xs text-black/30 tracking-wide">Hooks into live prices</span>
            </GlassCard>

            <GlassCard className="p-6 md:p-8 flex flex-col justify-between min-h-[160px] hover:border-black/[0.12] transition-colors md:col-span-2 lg:col-span-1">
              <div>
                <p className="text-[11px] tracking-widest text-black/35 uppercase mb-2">Arena rank</p>
                <p className="text-3xl md:text-4xl font-light text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
                  —
                </p>
              </div>
              <span className="text-xs text-black/30 tracking-wide">Leaderboard placeholder</span>
            </GlassCard>
          </div>

          <GlassCard className="mt-3 p-8 md:p-10 border-dashed border-black/[0.12] bg-[#fafaf8]/80">
            <p className="text-sm text-black/45 leading-relaxed max-w-2xl">
              This shell matches the landing palette and glass cards. Plug in subgraph feeds, agent tick loops, and wallet state here.
              {" "}
              <Link href="/" className="text-black/60 underline underline-offset-4 hover:text-black transition-colors">
                Back to marketing site
              </Link>
            </p>
          </GlassCard>
        </div>
      </main>
    </SitePageShell>
  )
}
