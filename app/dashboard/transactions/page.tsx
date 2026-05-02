import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getSessionProfile } from "@/lib/auth/session-profile"
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar"
import { TransactionsView } from "@/components/dashboard/transactions-view"
import { SitePageShell } from "@/components/layout/site-page-shell"

export default async function TransactionsPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth?next=/dashboard/transactions")

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar
          userEmail={profile.email}
          embeddedWalletAddress={profile.embeddedWalletAddress}
          crumbs={[
            { label: "Agents", href: "/dashboard" },
            { label: "Transactions" },
          ]}
        />
        <main className="flex-1">
          <Suspense
            fallback={
              <div className="py-16 text-center text-[13px] text-black/40">
                Loading…
              </div>
            }
          >
            <TransactionsView />
          </Suspense>
        </main>
      </div>
    </SitePageShell>
  );
}
