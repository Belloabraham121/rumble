import type { ReactNode } from "react"
import "@rainbow-me/rainbowkit/styles.css"
import { LiquidityLabProviders } from "@/components/liquidity-lab/liquidity-lab-providers"

export default function LiquidityLabLayout({ children }: { children: ReactNode }) {
  return <LiquidityLabProviders>{children}</LiquidityLabProviders>
}
