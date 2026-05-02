import { redirect } from "next/navigation"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar"
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace"
import { SitePageShell } from "@/components/layout/site-page-shell"

type Params = Promise<{ agentId: string }>

export default async function AgentTradingPage({ params }: { params: Params }) {
  const profile = await getSessionProfile()
  const { agentId } = await params
  if (!profile) redirect(`/auth?next=/dashboard/agents/${agentId}`)

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar
          userEmail={profile.email}
          embeddedWalletAddress={profile.embeddedWalletAddress}
          crumbs={[{ label: "Agents", href: "/dashboard" }, { label: "Trading" }]}
        />
        <main className="flex-1 px-3 sm:px-4 md:px-5 py-4 md:py-5">
          <DashboardWorkspace agentId={agentId} />
        </main>
      </div>
    </SitePageShell>
  )
}
