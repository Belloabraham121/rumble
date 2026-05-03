import "server-only"

import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getPoolPrice } from "@/lib/data/pool-prices.repo"
import { getRomboServerEnv } from "@/lib/rombo/server-env"
import type { PriceSymbol } from "@/lib/trading/token-meta"

/**
 * Spot ETH/USD for translating gas costs — subgraph pool cache when available,
 * else `ROMBO_ETH_USD_REF`, else a conservative default.
 */
export async function getEthUsdSpot(): Promise<number> {
  const env = getRomboServerEnv()
  const explicit = env.romboEthUsdRef
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit
  }

  const doc = await getPoolPrice({
    chainId: env.defaultChainId,
    arenaPoolId: "eth-usdc" satisfies ArenaPoolId,
  })
  const raw = doc?.displayUsd
  const n = raw !== undefined ? Number.parseFloat(String(raw)) : NaN
  if (Number.isFinite(n) && n > 0) {
    return n
  }

  return 2306.94
}

/**
 * USD price for **one full token** at `timestampMs` — used for PnL v1 marks.
 *
 * v1 uses **live pool spot** from cache (`getPoolPrice`) regardless of `timestampMs`.
 * Next step: historical Chainlink or subgraph bundle-at-period when persisting fills at tx time.
 */
export async function getRefPriceAtTime(input: { symbol: PriceSymbol; timestampMs: number }): Promise<number> {
  void input.timestampMs
  const env = getRomboServerEnv()

  if (input.symbol === "USDC" || input.symbol === "USDT") {
    return 1
  }

  if (input.symbol === "ETH") {
    return await getEthUsdSpot()
  }

  if (input.symbol === "WBTC") {
    const doc = await getPoolPrice({
      chainId: env.defaultChainId,
      arenaPoolId: "wbtc-eth" satisfies ArenaPoolId,
    })
    const raw = doc?.displayUsd
    const n = raw !== undefined ? Number.parseFloat(String(raw)) : NaN
    if (Number.isFinite(n) && n > 0) {
      return n
    }
    return (await getEthUsdSpot()) * 65
  }

  return await getEthUsdSpot()
}
