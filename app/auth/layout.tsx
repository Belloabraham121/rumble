import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in — ROMBO",
  description: "Access your Rombo agent workspace.",
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
