"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { GlassCard } from "@/components/layout/glass-card"

type Mode = "sign-in" | "register"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] tracking-widest text-black/40 uppercase mb-2"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {children}
    </label>
  )
}

export function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get("next") || "/dashboard"
  const modeParam = searchParams.get("mode")

  const [mode, setMode] = useState<Mode>(() =>
    modeParam === "register" ? "register" : "sign-in",
  )
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (modeParam === "register" || modeParam === "sign-in") {
      setMode(modeParam === "register" ? "register" : "sign-in")
    }
  }, [modeParam])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login"
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong.")
        return
      }

      if (mode === "register") {
        toast.success("Account created", {
          description: "Your embedded wallet is being provisioned. You can open the dashboard now.",
        })
      } else {
        toast.success("Signed in", {
          description: "Welcome back.",
        })
      }

      router.push(nextUrl)
      router.refresh()
    } catch {
      toast.error("Network error", { description: "Try again in a moment." })
    } finally {
      setPending(false)
    }
  }

  const title = mode === "register" ? "Create your workspace" : "Sign in to your workspace"
  const subtitle =
    mode === "register"
      ? "Register to create your Rombo account. We provision an embedded Ethereum wallet (Privy) for funding and trading."
      : "Sign in with the email you used to register."

  return (
    <GlassCard className="p-8 md:p-10 max-w-md w-full">
      <div className="mb-8">
        <p className="text-[11px] tracking-[0.2em] text-black/35 uppercase mb-3">
          {mode === "register" ? "New here" : "Welcome back"}
        </p>
        <h1
          className="text-3xl md:text-4xl font-light tracking-tight text-[#111] leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          {title}
        </h1>
        <p className="mt-3 text-sm text-black/45 leading-relaxed">{subtitle}</p>
      </div>

      <div className="flex rounded-xl border border-black/10 p-0.5 bg-black/[0.02] mb-6">
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className={`flex-1 rounded-[10px] py-2 text-[11px] tracking-wide transition-colors ${
            mode === "sign-in"
              ? "bg-white text-[#111] shadow-sm border border-black/[0.06]"
              : "text-black/45 hover:text-black/70"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 rounded-[10px] py-2 text-[11px] tracking-wide transition-colors ${
            mode === "register"
              ? "bg-white text-[#111] shadow-sm border border-black/[0.06]"
              : "text-black/45 hover:text-black/70"
          }`}
        >
          Register
        </button>
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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
          />
          <p className="mt-1.5 text-[11px] text-black/35">At least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full px-8 py-3 bg-[#111] text-white text-sm rounded-xl hover:bg-[#333] transition-colors tracking-widest font-medium disabled:opacity-60"
        >
          {pending ? "Please wait…" : mode === "register" ? "Create account" : "Continue"}
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
