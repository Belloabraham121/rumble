import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { base, baseSepolia } from "wagmi/chains"

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""

export const liquidityLabWagmiConfig = getDefaultConfig({
  appName: "Rombo liquidity lab",
  /** Dummy id only so the bundle initializes; Reown still requires a real id + allowlisted origin for WalletConnect. */
  projectId: projectId || "00000000000000000000000000000000",
  chains: [baseSepolia, base],
  ssr: true,
})
