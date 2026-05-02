import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { AgentsOverview } from "@/components/dashboard/agents-overview"
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar"
import { SitePageShell } from "@/components/layout/site-page-shell"

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) redirect("/auth?next=/dashboard")

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar userEmail={user.email} crumbs={[{ label: "Agents" }]} />
        <main className="flex-1">
          <AgentsOverview />
        </main>
      </div>
    </SitePageShell>
  )
}
