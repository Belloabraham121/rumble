import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { DashboardBrandBar } from "@/components/dashboard/dashboard-brand-bar";
import { TransactionsView } from "@/components/dashboard/transactions-view";
import { SitePageShell } from "@/components/layout/site-page-shell";

export default async function TransactionsPage() {
  const user = await getSession();
  if (!user) redirect("/auth?next=/dashboard/transactions");

  return (
    <SitePageShell>
      <div className="min-h-screen flex flex-col">
        <DashboardBrandBar
          userEmail={user.email}
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
