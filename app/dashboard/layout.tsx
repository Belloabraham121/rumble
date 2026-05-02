import type { Metadata } from "next"
import { AgentsStoreProvider } from "@/lib/agents/agents-store"

export const metadata: Metadata = {
  title: "Dashboard — ROMBO",
  description: "Monitor and control your Rombo Uniswap agents.",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AgentsStoreProvider>{children}</AgentsStoreProvider>
}
