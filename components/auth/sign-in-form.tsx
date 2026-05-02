"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { GlassCard } from "@/components/layout/glass-card"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] tracking-widest text-black/40 uppercase mb-2" style={{ fontFamily: "system-ui, sans-serif" }}>
      {children}
    </label>
  )
}

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get("next") || "/dashboard"

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Could not sign in.")
        return
      }
      router.push(nextUrl)
      router.refresh()
    } catch {
      setError("Network error. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <GlassCard className="p-8 md:p-10 max-w-md w-full">
      <div className="mb-8">
        <p className="text-[11px] tracking-[0.2em] text-black/35 uppercase mb-3">Welcome back</p>
        <h1
          className="text-3xl md:text-4xl font-light tracking-tight text-[#111] leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          Sign in to your workspace
        </h1>
        <p className="mt-3 text-sm text-black/45 leading-relaxed">
          Demo auth — replace <code className="text-xs bg-black/[0.04] px-1 py-0.5 rounded">/api/auth/login</code> with your provider.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@team.xyz"
            className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
          />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600/90 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-8 py-3 bg-[#111] text-white text-sm rounded-xl hover:bg-[#333] transition-colors tracking-widest font-medium disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>

      <p className="mt-8 pt-6 border-t border-black/[0.06] text-center text-xs text-black/35 tracking-wide">
        <Link href="/" className="text-black/50 hover:text-black transition-colors">
          ← Back to home
        </Link>
      </p>
    </GlassCard>
  )
}
