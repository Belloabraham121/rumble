import type { RomboChainSlug } from "@/lib/rombo/chain-config"

/**
 * Runtime shape of a user's lab pool — produced from Mongo (`LabPoolDoc`) or an
 * HTTP registry response. Keep this flat/serializable so it can cross the
 * client ↔ server boundary without converters.
 */
export type LabPoolToken = {
  address: string
  symbol: string
  decimals: number
  isNative: boolean
}

export type LabPoolDef = {
  labPoolId: string
  chainSlug: RomboChainSlug
  chainId: number
  protocol: "V4"
  fee: number
  tickSpacing: number
  hooks: string
  token0: LabPoolToken
  token1: LabPoolToken
  v4PoolId: string
  label: string
}

/** Deterministic id used as the key in `LabPoolDoc` + `enabledLabPoolIds`. */
export function buildLabPoolId(chainSlug: RomboChainSlug, v4PoolId: string): string {
  return `${chainSlug}:${v4PoolId.toLowerCase()}`
}

/** Human-readable label like `ETH / tUSDC · 0.05% · V4`. */
export function formatLabPoolLabel(input: {
  token0Symbol: string
  token1Symbol: string
  feePpm: number
}): string {
  const feePct = (input.feePpm / 10_000).toString()
  return `${input.token0Symbol} / ${input.token1Symbol} · ${feePct}% · V4`
}

/** Common USD-stable symbol detector — used by the pricing fallback. */
export function looksLikeUsdStable(symbol: string): boolean {
  return /(usd|usdc|usdt|dai|busd)/i.test(symbol.trim())
}

/** V4 native-ETH sentinel address (`currency0` in our lab pools when ETH side). */
export const V4_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000"

export function isNativeV4Address(addr: string): boolean {
  return addr.toLowerCase() === V4_NATIVE_ADDRESS
}
