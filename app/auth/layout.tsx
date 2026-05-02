import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in — RUMBLE",
  description: "Access your Rumble agent workspace.",
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
