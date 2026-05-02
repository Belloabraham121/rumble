import Link from "next/link"
import { SignInFormWithSuspense } from "@/components/auth/sign-in-form-suspense"
import { SitePageShell } from "@/components/layout/site-page-shell"
import { SiteHeader } from "@/components/layout/site-header"

export default function AuthPage() {
  return (
    <SitePageShell>
      <SiteHeader
        right={
          <Link
            href="/"
            className="text-[11px] text-black/50 hover:text-black tracking-wide transition-colors"
            style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
          >
            Home
          </Link>
        }
      />
      <main className="min-h-screen pt-32 pb-24 px-6 flex flex-col items-center justify-start md:justify-center">
        <SignInFormWithSuspense />
      </main>
    </SitePageShell>
  )
}
