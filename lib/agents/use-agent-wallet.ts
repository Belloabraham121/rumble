"use client"

import { useEffect, useState } from "react"

export type AgentWalletPayload = {
  address: string | null
  chainId: number
  balanceEth: string | null
  balanceUsdc: string | null
  error?: string
}

export function useAgentWallet(agentId: string | undefined) {
  const [wallet, setWallet] = useState<AgentWalletPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!agentId) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/wallet`, {
          credentials: "same-origin",
        })
        if (!r.ok || cancelled) return
        const j = (await r.json()) as AgentWalletPayload
        setWallet(j)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = window.setInterval(load, 25_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [agentId])

  return { wallet, loading }
}
