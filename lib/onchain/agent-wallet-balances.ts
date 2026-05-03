import "server-only"

import { erc20BalanceOfRaw, ethGetBalanceWei, resolveAgentRuntimeRpcUrl } from "@/lib/rombo/json-rpc"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

/** Canonical USDC on Base test/main — lowercase checks in `token-meta`. */
const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCf7e",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
}

function tenPowBigInt(exp: number): bigint {
  let r = BigInt(1)
  for (let i = 0; i < exp; i++) r = r * BigInt(10)
  return r
}

/** Non-negative balances only — avoids bigint literals for ES6 target. */
function formatUnits(value: bigint, decimals: number): string {
  const base = tenPowBigInt(decimals)
  const whole = value / base
  const frac = value % base
  if (decimals === 0) return `${whole}`
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`
}

export type AgentWalletBalances = {
  balanceEth: string
  balanceUsdc: string
}

export async function fetchAgentWalletBalances(input: {
  chainId: number
  walletAddress: string
}): Promise<AgentWalletBalances> {
  const env = getRomboServerEnv()
  const rpc = resolveAgentRuntimeRpcUrl(input.chainId, env.romboRpcUrl)
  const addr = input.walletAddress as `0x${string}`
  const wei = await ethGetBalanceWei(rpc, addr)
  const eth = formatUnits(wei, 18)

  const usdcToken = USDC_BY_CHAIN[input.chainId]
  let usdc = "0"
  if (usdcToken) {
    const raw = await erc20BalanceOfRaw(rpc, usdcToken, addr)
    usdc = formatUnits(raw, 6)
  }

  return { balanceEth: eth, balanceUsdc: usdc }
}
