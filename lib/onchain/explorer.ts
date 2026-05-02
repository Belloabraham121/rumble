/** Block explorer URLs for dashboard links (client + server safe). */

export function transactionExplorerUrl(chainId: number, txHash: string): string | undefined {
  const h = txHash.trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(h)) return undefined

  switch (chainId) {
    case 8453:
      return `https://basescan.org/tx/${h}`
    case 84532:
      return `https://sepolia.basescan.org/tx/${h}`
    default:
      return undefined
  }
}
