import { redirect } from "next/navigation"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar"
import { SitePageShell } from "@/components/layout/site-page-shell"
import { LiquidityLabClient } from "@/components/liquidity-lab/liquidity-lab-client"

export default async function LiquidityLabPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth?next=/dashboard/liquidity-lab")

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar
          userEmail={profile.email}
          embeddedWalletAddress={profile.embeddedWalletAddress}
          crumbs={[
            { label: "Agents", href: "/dashboard" },
            { label: "Liquidity lab" },
          ]}
        />
        <main className="flex-1 bg-[#F5F4F0]">
          <LiquidityLabClient />
        </main>
      </div>
    </SitePageShell>
  )
}
