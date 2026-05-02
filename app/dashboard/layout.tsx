import type { Metadata } from "next"
import { AgentsStoreProvider } from "@/lib/agents/agents-store"

export const metadata: Metadata = {
  title: "Dashboard — RUMBLE",
  description: "Monitor and control your Rumble Uniswap agents.",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AgentsStoreProvider>{children}</AgentsStoreProvider>
}
