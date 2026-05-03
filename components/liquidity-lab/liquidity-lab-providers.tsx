"use client"

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider } from "wagmi"
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit"
import { liquidityLabWagmiConfig } from "@/lib/liquidity-lab/wagmi-config"

const queryClient = new QueryClient()

export function LiquidityLabProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={liquidityLabWagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({ accentColor: "#171717", borderRadius: "large" })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
