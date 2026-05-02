import React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, IBM_Plex_Sans } from "next/font/google"
import { Courier_Prime } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AppProviders } from "@/components/providers/app-providers"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _courierPrime = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"] });
const _ibmPlexSans = IBM_Plex_Sans({ weight: ["300", "400", "500", "600"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'RUMBLE — Build Autonomous Uniswap Agents',
  description: 'Build & orchestrate autonomous Uniswap agents that trade, provide liquidity, and execute strategies 24/7. Visual agent builder, real-time monitoring, and enterprise security.',
  keywords: ['Uniswap agents', 'DeFi agents', 'autonomous trading', 'liquidity management', 'AI agents', 'Uniswap v4'],
  authors: [{ name: 'RUMBLE' }],
  openGraph: {
    title: 'RUMBLE — Build Autonomous Uniswap Agents',
    description: 'Build & orchestrate autonomous Uniswap agents that trade, provide liquidity, and execute strategies 24/7.',
    type: 'website',
    url: 'https://rumble.ai',
    siteName: 'RUMBLE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RUMBLE — Build Autonomous Uniswap Agents',
    description: 'Build & orchestrate autonomous Uniswap agents that trade, provide liquidity, and execute strategies 24/7.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  )
}
