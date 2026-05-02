import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/auth/session"
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace"
import { SitePageShell } from "@/components/layout/site-page-shell"

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) redirect("/auth?next=/dashboard")

  return (
    <SitePageShell>
      <div className="fixed top-4 left-4 z-50">
        <Link
          href="/"
          className="font-pixel text-xs tracking-[0.25em] text-black/70 hover:text-black transition-colors px-3 py-2 rounded-xl border border-black/10 bg-[#F5F4F0]/85 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.06)]"
        >
          ROMBO
        </Link>
      </div>

      <main className="pt-20 pb-6 px-3 sm:px-4 md:px-5">
        <DashboardWorkspace />
      </main>
    </SitePageShell>
  )
}
