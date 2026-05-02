import { redirect } from "next/navigation"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { AgentsOverview } from "@/components/dashboard/agents-overview"
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar"
import { SitePageShell } from "@/components/layout/site-page-shell"

export default async function DashboardPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth?next=/dashboard")

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar
          userEmail={profile.email}
          embeddedWalletAddress={profile.embeddedWalletAddress}
          crumbs={[{ label: "Agents" }]}
        />
        <main className="flex-1">
          <AgentsOverview />
        </main>
      </div>
    </SitePageShell>
  )
}
