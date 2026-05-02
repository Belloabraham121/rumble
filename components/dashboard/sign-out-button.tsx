"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      toast.success("Signed out")
      router.push("/")
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="text-[11px] px-4 py-2 rounded-xl border border-black/10 text-black/60 hover:text-black hover:border-black/20 hover:bg-black/[0.03] transition-all duration-200 tracking-wide disabled:opacity-50"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}
