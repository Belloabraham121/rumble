/**
 * Decimals for known Base / Base Sepolia tokens (lowercase 0x address).
 * Extend as new pools are added; unknown → 18.
 */
const DECIMALS_BY_ADDRESS: Record<string, number> = {
  // WETH (Base + Base Sepolia)
  "0x4200000000000000000000000000000000000006": 18,
  // USDC
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": 6,
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,
  // USDT
  "0x2d82c4b9ff582d02cc89675f2d086cb7953a555a": 6,
  "0xfde4c96c8593536e31f229ea8f37b2ada2699f2c": 6,
  // WBTC
  "0x16ca4dac32d5c3206b1be15876a08660e580a8b5": 8,
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": 8,
}

export function tokenDecimalsForAddress(address: string): number {
  const a = address.trim().toLowerCase()
  return DECIMALS_BY_ADDRESS[a] ?? 18
}

export type PriceSymbol = "ETH" | "USDC" | "WBTC" | "USDT"

/** Map known addresses → coarse symbol for USD marking (v1). */
export function inferPriceSymbol(tokenAddress: string): PriceSymbol | null {
  const a = tokenAddress.trim().toLowerCase()
  if (a === "0x4200000000000000000000000000000000000006") return "ETH"
  if (a === "0x036cbd53842c5426634e7929541ec2318f3dcf7e") return "USDC"
  if (a === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") return "USDC"
  if (a === "0x2d82c4b9ff582d02cc89675f2d086cb7953a555a") return "USDT"
  if (a === "0xfde4c96c8593536e31f229ea8f37b2ada2699f2c") return "USDT"
  if (a === "0x16ca4dac32d5c3206b1be15876a08660e580a8b5") return "WBTC"
  if (a === "0x0555e30da8f98308edb960aa94c0db47230d2b9c") return "WBTC"
  return null
}
