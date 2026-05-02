import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard — ROMBO",
  description: "Monitor and control your Rombo Uniswap agents.",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
