"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { SignOutButton } from "@/components/dashboard/sign-out-button"

type Crumb = { label: string; href?: string }

function shortenAddr(addr: string): string {
  const a = addr.trim()
  if (a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

type Props = {
  userEmail?: string | null
  /** From Mongo after Privy bridge — optional until provisioning completes. */
  embeddedWalletAddress?: string | null
  crumbs?: Crumb[]
}

type HeaderBalances = {
  chainName: string
  balanceEth: string
  balanceUsdc: string
}

export function DashboardBrandBar({ userEmail, embeddedWalletAddress: initialWallet, crumbs }: Props) {
  const [wallet, setWallet] = useState<string | null>(initialWallet ?? null)
  const [headerBalances, setHeaderBalances] = useState<HeaderBalances | null>(null)

  useEffect(() => {
    setWallet(initialWallet ?? null)
  }, [initialWallet])

  const loadBalances = useCallback(async () => {
    if (!wallet) {
      setHeaderBalances(null)
      return
    }
    try {
      const r = await fetch("/api/auth/wallet-balances", {
        credentials: "same-origin",
        cache: "no-store",
      })
      const j = (await r.json()) as {
        chainName?: string
        balanceEth?: string
        balanceUsdc?: string
        chainId?: number
        error?: string
      }

      const pickBal = (raw: unknown): string => {
        if (raw == null) return "—"
        if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
        if (typeof raw === "string") return raw.length > 0 ? raw : "—"
        return "—"
      }

      const chainName = j.chainName?.trim() || "Network"

      // Always show a line under the address when the API explains the chain (incl. 502 body).
      if (!r.ok && r.status === 404) {
        setHeaderBalances(null)
        return
      }

      setHeaderBalances({
        chainName,
        balanceEth: pickBal(j.balanceEth),
        balanceUsdc: pickBal(j.balanceUsdc),
      })
    } catch {
      setHeaderBalances(null)
    }
  }, [wallet])

  useEffect(() => {
    void loadBalances()
    if (!wallet) return
    const id = window.setInterval(() => void loadBalances(), 25_000)
    return () => window.clearInterval(id)
  }, [wallet, loadBalances])

  const copyWallet = useCallback(() => {
    if (!wallet) return
    void navigator.clipboard.writeText(wallet).then(
      () => toast.success("Wallet address copied"),
      () => toast.error("Could not copy address"),
    )
  }, [wallet])

  /** Poll briefly after registration so the embedded address appears without full page reload. */
  useEffect(() => {
    if (wallet) return
    let cancelled = false
    let tries = 0

    async function poll(intervalId: number) {
      if (cancelled) return
      tries += 1
      try {
        const r = await fetch("/api/auth/me", { credentials: "same-origin" })
        if (!r.ok) return
        const j = (await r.json()) as {
          user?: { embeddedWalletAddress?: string } | null
        }
        const w = j.user?.embeddedWalletAddress
        if (w) {
          setWallet(w)
          window.clearInterval(intervalId)
          return
        }
        if (tries >= 12) window.clearInterval(intervalId)
      } catch {
        /* ignore */
      }
    }

    const id = window.setInterval(() => {
      void poll(id)
    }, 2500)

    void poll(id)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [wallet])

  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-black/[0.06] bg-[#F5F4F0]/85 backdrop-blur-md">
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard"
          className="font-pixel text-xs tracking-[0.25em] text-black/70 hover:text-black transition-colors px-3 py-2 rounded-xl border border-black/10 bg-white shadow-[0_6px_24px_rgba(0,0,0,0.05)]"
        >
          ROMBO
        </Link>
        <Link
          href="/dashboard/transactions"
          className="hidden sm:inline-flex text-[10px] tracking-[0.18em] uppercase px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-black/55 hover:text-black hover:bg-white transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
        >
          Transactions
        </Link>
        <Link
          href="/dashboard/liquidity-lab"
          className="hidden md:inline-flex text-[10px] tracking-[0.18em] uppercase px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-black/55 hover:text-black hover:bg-white transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
        >
          Liquidity lab
        </Link>
      </div>

      <nav className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden text-[11px] text-black/50">
        {(crumbs ?? [{ label: "Agents" }]).map((c, i) => {
          const last = i === (crumbs?.length ?? 1) - 1
          return (
            <span key={`${c.label}-${i}`} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span className="text-black/25">/</span>}
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-black transition-colors truncate tracking-wide">
                  {c.label}
                </Link>
              ) : (
                <span className={`truncate tracking-wide ${last ? "text-black/80" : ""}`}>{c.label}</span>
              )}
            </span>
          )
        })}
      </nav>

      <div className="shrink-0 flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
        {wallet && (
          <button
            type="button"
            onClick={copyWallet}
            title={`${wallet} — click to copy`}
            className="flex flex-col items-end gap-0.5 font-mono text-left text-[10px] text-black/50 bg-white/80 border border-black/10 px-2.5 py-1.5 rounded-lg max-w-[min(100vw-12rem,260px)] hover:bg-white hover:border-black/18 transition-colors"
          >
            <span className="w-full truncate text-black/65">{shortenAddr(wallet)}</span>
            {headerBalances ? (
              <>
                <span className="w-full text-[9px] font-sans tracking-wide text-black/40">{headerBalances.chainName}</span>
                <span className="w-full tabular-nums text-[9px] text-black/55">
                  ETH {headerBalances.balanceEth} · USDC {headerBalances.balanceUsdc}
                </span>
              </>
            ) : (
              <span className="w-full text-[9px] font-sans text-black/35">Loading balances…</span>
            )}
          </button>
        )}
        {userEmail && (
          <span className="hidden sm:inline text-[11px] text-black/45 truncate max-w-[180px]" title={userEmail}>
            {userEmail}
          </span>
        )}
        <SignOutButton />
      </div>
    </div>
  )
}
