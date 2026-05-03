"use client"

import { useCallback, useMemo, useState } from "react"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import {
  useAccount,
  useChainId,
  useDeployContract,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi"
import { isAddress, parseAbi, parseUnits, type Address, type Hex } from "viem"
import { toast } from "sonner"
import { base, baseSepolia } from "wagmi/chains"
import type { Chain, PublicClient, WalletClient } from "viem"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"
import type { RomboChainSlug } from "@/lib/rombo/chain-config"
import { MINIMAL_LAB_TOKEN_ABI, MINIMAL_LAB_TOKEN_BYTECODE } from "@/lib/liquidity-lab/minimal-lab-token.generated"
import {
  extractOrderedLpTransactionsClient,
  mapLabUnsignedTx,
  type LabUnsignedTx,
} from "@/lib/liquidity-lab/lp-tx-from-response"
import { WalletConnectSetupNote } from "@/components/liquidity-lab/walletconnect-setup-note"
import {
  V4_NATIVE_CURRENCY,
  V4_NO_HOOKS,
  computeV4PoolId,
  readV4PoolSlot0,
  sortV4Currencies,
  v4TickSpacingForSwapFee,
} from "@/lib/liquidity-lab/v4-pool"
import { encodeSqrtRatioX96 } from "@/lib/liquidity-lab/sqrt-price-x96"

const CHAINS = [
  { id: baseSepolia.id, slug: "base-sepolia" as RomboChainSlug, label: "Base Sepolia" },
  { id: base.id, slug: "base-mainnet" as RomboChainSlug, label: "Base" },
]

function tickSpacingForFee(fee: number): number {
  if (fee === 100) return 1
  if (fee === 500) return 10
  if (fee === 3000) return 60
  if (fee === 10000) return 200
  return 10
}

function wideTickBounds(currentTick: number, feeTier: number): { tickLower: number; tickUpper: number } {
  const spacing = tickSpacingForFee(feeTier)
  const span = 5000
  const lower = Math.floor((currentTick - span) / spacing) * spacing
  const upper = Math.ceil((currentTick + span) / spacing) * spacing
  return { tickLower: lower, tickUpper: upper }
}

const ERC20_DECIMALS_ABI = parseAbi(["function decimals() view returns (uint8)"])
const ERC20_BALANCE_OF_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"])

/**
 * Pick the EIP-712 primary type from a permit envelope. Uniswap returns `{domain,types,values}`
 * without `primaryType`; Permit2 batch is `PermitBatch`, NFT permit is `Permit` / `PermitSingle`.
 * Falls back to the first non-`EIP712Domain` key so we don't hard-code a structure.
 */
function pickEip712PrimaryType(types: Record<string, unknown>): string {
  if (typeof types !== "object" || !types) return "PermitBatch"
  if ("PermitBatch" in types) return "PermitBatch"
  if ("PermitSingle" in types) return "PermitSingle"
  if ("Permit" in types) return "Permit"
  for (const k of Object.keys(types)) if (k !== "EIP712Domain") return k
  return "PermitBatch"
}

type LpV4Permit = {
  domain: Record<string, unknown>
  types: Record<string, unknown>
  values: Record<string, unknown>
  primaryType?: string
}

/**
 * Run the Uniswap LP approval flow before `/lp/create`:
 * 1) `/lp/check_approval` with `{ walletAddress, protocol: "V4", chainId, lpTokens, action: "CREATE" }`.
 * 2) Broadcast every ERC-20 → Permit2 approval `transactions[]` returned by the API.
 * 3) Sign `v4BatchPermitData` (EIP-712 PermitBatch) so the LP multicall can settle Permit2 in-band.
 * Without this, the LP multicall reverts with `AllowanceExpired(uint256)` (selector 0xd81b2f2e).
 */
async function prepareLpV4ApprovalsAndPermit(input: {
  walletClient: WalletClient
  publicClient: PublicClient
  address: Address
  chain: Chain
  chainId: number
  lpTokens: Array<{ tokenAddress: string; amount: string }>
  action: "CREATE" | "INCREASE" | "DECREASE" | "MIGRATE"
}): Promise<{ batchPermitData?: LpV4Permit; signature?: Hex }> {
  const { walletClient, publicClient, address, chain, chainId, lpTokens, action } = input

  const checkRes = await fetch("/api/liquidity/check-approval", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: address,
      protocol: "V4",
      chainId,
      lpTokens,
      action,
      simulateTransaction: false,
    }),
  })
  const checkJson = (await checkRes.json()) as Record<string, unknown>
  if (!checkRes.ok) {
    const err = typeof checkJson.error === "string" ? checkJson.error : "Check LP approval failed"
    throw new Error(err)
  }

  const rawTxs = Array.isArray(checkJson.transactions) ? (checkJson.transactions as unknown[]) : []
  const approvalTxs: LabUnsignedTx[] = []
  for (const raw of rawTxs) {
    if (raw && typeof raw === "object") {
      const m = mapLabUnsignedTx(raw as Record<string, unknown>)
      if (m) approvalTxs.push(m)
    }
  }
  for (let i = 0; i < approvalTxs.length; i += 1) {
    const tx = approvalTxs[i]
    const hash = await walletClient.sendTransaction({
      chain,
      account: address,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? BigInt(0),
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    })
    /** Wait so the next-call permit nonce + Permit2 contract spends the new allowance, not stale state. */
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const permit = checkJson.v4BatchPermitData
  if (!permit || typeof permit !== "object") return {}
  const p = permit as { domain?: unknown; types?: unknown; values?: unknown; primaryType?: unknown }
  if (
    !p.domain ||
    typeof p.domain !== "object" ||
    !p.types ||
    typeof p.types !== "object" ||
    !p.values ||
    typeof p.values !== "object"
  ) {
    return {}
  }
  const types = p.types as Record<string, unknown>
  const primaryType =
    typeof p.primaryType === "string" && p.primaryType.length > 0
      ? p.primaryType
      : pickEip712PrimaryType(types)

  /** viem `signTypedData` is heavily generic over a TypedData literal; the API gives us
   * dynamic shapes, so cast the input — viem still serializes the EIP-712 envelope correctly. */
  const signature = (await walletClient.signTypedData({
    account: address,
    domain: p.domain as never,
    types: types as never,
    primaryType: primaryType as never,
    message: p.values as never,
  } as never)) as Hex

  return {
    batchPermitData: {
      domain: p.domain as Record<string, unknown>,
      types,
      values: p.values as Record<string, unknown>,
      primaryType,
    },
    signature,
  }
}

/** Raw token1/token0 ratio from human token1-per-token0 (display units). */
function humanToRawRatio(human: number, dec0: number, dec1: number): number {
  if (!(Number.isFinite(human) && human > 0)) return 1
  return human * Math.pow(10, dec1 - dec0)
}

/** Floor tick from raw token1/token0 ratio (same convention as Uniswap `TickMath`). */
function rawRatioToTick(raw: number): number {
  if (!(raw > 0 && Number.isFinite(raw))) return 0
  return Math.floor(Math.log(raw) / Math.log(1.0001))
}

function humanPriceStringForParseUnits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0.00000001"
  const x = Number.parseFloat(n.toPrecision(12))
  if (Number.isInteger(x)) return `${Math.trunc(x)}`
  const s = x.toFixed(8).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.$/, "")
  return s.length ? s : String(x)
}

/**
 * `sqrtPriceX96 = floor(sqrt(amount1_raw / amount0_raw) * 2^96)`.
 * `amount0_raw = 10^token0Dec` (1 whole unit of token0), `amount1_raw = humanCenter * 10^token1Dec`.
 * Returns the full BigInt as a decimal string (906adf: earlier "truncation" to 24 digits was actually correct sqrt
 * for token1=6 decimals; the original bug was interpreting it as "truncated" and rewriting with hardcoded 18/18 on server).
 */
function newPoolV4InitialSqrtPriceX96(
  humanCenter: number,
  token0Dec: number,
  token1Dec: number,
): string {
  const humanStr = humanPriceStringForParseUnits(humanCenter)
  const amount1 = parseUnits(humanStr, token1Dec)
  const amount0 = parseUnits("1", token0Dec)
  return encodeSqrtRatioX96(amount1, amount0).toString()
}

export function LiquidityLabClient() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const activeSlug = useMemo(
    () => CHAINS.find(c => c.id === chainId)?.slug ?? ("base-sepolia" as RomboChainSlug),
    [chainId],
  )

  const [tokenName, setTokenName] = useState("Test USD Coin")
  const [tokenSymbol, setTokenSymbol] = useState("tUSDC")
  const [tokenDecimals, setTokenDecimals] = useState(6)
  const [tokenSupplyHuman, setTokenSupplyHuman] = useState("1000000")

  const [deployedAddress, setDeployedAddress] = useState<string | null>(null)
  /** ERC-20 to pair with ETH (same as deployed token after deploy, or paste any address). */
  const [pairErc20Address, setPairErc20Address] = useState("")

  const [ethAmount, setEthAmount] = useState("0.01")
  const [customPairEthAmount, setCustomPairEthAmount] = useState("0.01")
  /** Human: whole ERC-20 tokens per 1 ETH — used only when creating a new v4 pool (no pool yet). */
  const [pairInitialPriceTokenPerEth, setPairInitialPriceTokenPerEth] = useState("10000")
  const [customPairFee] = useState(500)
  const [lpPending, setLpPending] = useState(false)
  const [customLpPending, setCustomLpPending] = useState(false)

  const { deployContractAsync, isPending: deployPending } = useDeployContract()

  const deployLabToken = useCallback(async () => {
    if (!address) {
      toast.error("Connect a wallet first")
      return
    }
    if (!publicClient) {
      toast.error("Network client not ready")
      return
    }
    try {
      const supply = parseUnits(tokenSupplyHuman, tokenDecimals)
      const hash = await deployContractAsync({
        chainId,
        abi: MINIMAL_LAB_TOKEN_ABI,
        bytecode: MINIMAL_LAB_TOKEN_BYTECODE as `0x${string}`,
        args: [tokenName, tokenSymbol, tokenDecimals, supply],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const addr = receipt.contractAddress
      if (addr) {
        setDeployedAddress(addr)
        setPairErc20Address(addr)
        toast.success("Token deployed — ERC-20 address filled for pairing below.", { description: addr })
      } else {
        toast.success("Deploy confirmed", { description: hash })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed")
    }
  }, [
    address,
    publicClient,
    deployContractAsync,
    tokenName,
    tokenSymbol,
    tokenDecimals,
    tokenSupplyHuman,
    chainId,
  ])

  const addEthUsdcLiquidity = useCallback(async () => {
    if (!address || !walletClient || !publicClient) {
      toast.error("Connect wallet and wait for network client")
      return
    }
    const meta = getArenaPoolOnChain("eth-usdc", activeSlug)
    if (!meta) {
      toast.error("This chain has no mapped ETH/USDC arena pool in Rombo config.")
      return
    }
    if (meta.chainId !== chainId) {
      toast.error("Switch your wallet to the pool’s chain (Base or Base Sepolia), then retry.")
      return
    }

    setLpPending(true)
    try {
      const usdcAddr = (meta.token0.symbol === "USDC" ? meta.token0.address : meta.token1.address) as Address
      const fee = meta.feeTier
      const tickSpacing = v4TickSpacingForSwapFee(fee)
      const [currency0, currency1] = sortV4Currencies(V4_NATIVE_CURRENCY, usdcAddr)
      const poolId = computeV4PoolId({
        currency0,
        currency1,
        fee,
        tickSpacing,
      })
      const slot0 = await readV4PoolSlot0({
        publicClient,
        chainId: meta.chainId,
        poolId,
      })
      if (!slot0.ok) {
        toast.error(
          slot0.reason === "no_pool_manager"
            ? "Uniswap v4 PoolManager is not configured for this chain in the lab."
            : "No initialized Uniswap v4 pool for native ETH + USDC at this fee tier on this chain. Create or seed that v4 pool first.",
        )
        return
      }
      const { tickLower, tickUpper } = wideTickBounds(slot0.tick, fee)
      const amountWei = parseUnits(ethAmount, 18)
      const nativeBalance = await publicClient.getBalance({ address })
      const independentToken = {
        tokenAddress: V4_NATIVE_CURRENCY.toLowerCase(),
        amount: amountWei.toString(),
      }

      await switchChainAsync?.({ chainId: meta.chainId })
      const chain = meta.chainId === base.id ? base : baseSepolia

      let usdcBalance: bigint
      try {
        usdcBalance = (await publicClient.readContract({
          address: usdcAddr,
          abi: ERC20_BALANCE_OF_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint
      } catch {
        toast.error("Could not read USDC balance for approval check.")
        return
      }
      if (usdcBalance === BigInt(0)) {
        toast.error("Wallet holds 0 USDC on this chain — fund USDC before adding ETH+USDC liquidity.")
        return
      }

      const { batchPermitData, signature } = await prepareLpV4ApprovalsAndPermit({
        walletClient,
        publicClient,
        address: address as Address,
        chain,
        chainId: meta.chainId,
        lpTokens: [{ tokenAddress: usdcAddr.toLowerCase(), amount: usdcBalance.toString() }],
        action: "CREATE",
      })

      const body: Record<string, unknown> = {
        idempotencyKey: `liquidity-lab-${Date.now()}`,
        walletAddress: address,
        chainId: meta.chainId,
        protocol: "V4" as const,
        slippageTolerance: 0.5,
        simulateTransaction: false,
        nativeTokenBalance: nativeBalance.toString(),
        existingPool: {
          token0Address: currency0.toLowerCase(),
          token1Address: currency1.toLowerCase(),
          poolReference: poolId.toLowerCase(),
        },
        independentToken,
        tickBounds: { tickLower, tickUpper },
        ...(batchPermitData ? { batchPermitData } : {}),
        ...(signature ? { signature } : {}),
      }

      const lpRes = await fetch("/api/liquidity/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const lpJson = await lpRes.json()
      if (!lpRes.ok) {
        toast.error(typeof lpJson.error === "string" ? lpJson.error : "Liquidity API error")
        return
      }

      const txs = extractOrderedLpTransactionsClient(lpJson)
      if (!txs.length) {
        toast.error("No transactions in liquidity response — check API shape.")
        return
      }

      let lastHash: `0x${string}` | undefined
      for (const tx of txs) {
        const h = await walletClient.sendTransaction({
          chain,
          account: address as `0x${string}`,
          to: tx.to,
          data: tx.data,
          value: tx.value ?? BigInt(0),
          gas: tx.gas,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        })
        lastHash = h
      }
      toast.success("Liquidity txs sent", { description: lastHash })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Liquidity flow failed")
    } finally {
      setLpPending(false)
    }
  }, [address, walletClient, publicClient, chainId, activeSlug, ethAmount, switchChainAsync])

  const addEthErc20PairLiquidity = useCallback(async () => {
    if (!address || !walletClient || !publicClient) {
      toast.error("Connect wallet and wait for network client")
      return
    }
    const trimmed = pairErc20Address.trim()
    if (!isAddress(trimmed)) {
      toast.error("Enter a valid ERC-20 contract address (0x…)")
      return
    }
    const erc20 = trimmed as Address
    if (erc20.toLowerCase() === V4_NATIVE_CURRENCY.toLowerCase()) {
      toast.error("Paste the ERC-20 contract address (not the native ETH placeholder).")
      return
    }

    setCustomLpPending(true)
    try {
      const tickSpacing = v4TickSpacingForSwapFee(customPairFee)
      const [currency0, currency1] = sortV4Currencies(V4_NATIVE_CURRENCY, erc20)
      const poolId = computeV4PoolId({
        currency0,
        currency1,
        fee: customPairFee,
        tickSpacing,
      })
      const slot0 = await readV4PoolSlot0({ publicClient, chainId, poolId })
      if (!slot0.ok && slot0.reason === "no_pool_manager") {
        toast.error("Uniswap v4 PoolManager is not configured for this chain in the lab.")
        return
      }

      const amountWei = parseUnits(customPairEthAmount, 18)
      const nativeBalance = await publicClient.getBalance({ address })
      const independentToken = {
        tokenAddress: V4_NATIVE_CURRENCY.toLowerCase(),
        amount: amountWei.toString(),
      }

      const common = {
        idempotencyKey: `liquidity-lab-custom-${Date.now()}`,
        walletAddress: address,
        chainId,
        protocol: "V4" as const,
        slippageTolerance: 0.5,
        simulateTransaction: false,
        nativeTokenBalance: nativeBalance.toString(),
        independentToken,
      }

      let body: Record<string, unknown>
      if (slot0.ok) {
        const { tickLower, tickUpper } = wideTickBounds(slot0.tick, customPairFee)
        body = {
          ...common,
          existingPool: {
            token0Address: currency0.toLowerCase(),
            token1Address: currency1.toLowerCase(),
            poolReference: poolId.toLowerCase(),
          },
          tickBounds: { tickLower, tickUpper },
        }
      } else {
        const rawPrice = pairInitialPriceTokenPerEth.trim() || "1"
        if (!/^\d+(\.\d+)?$/.test(rawPrice)) {
          toast.error("Initial price must be a positive decimal, e.g. 10000 or 0.5 (ERC-20 per 1 ETH).")
          return
        }
        const humanCenter = Number.parseFloat(rawPrice)
        if (!Number.isFinite(humanCenter) || humanCenter <= 0) {
          toast.error("Initial price must be a finite number greater than zero.")
          return
        }

        const token0Dec = 18
        let token1Dec: number
        try {
          token1Dec = Number(
            await publicClient.readContract({
              address: erc20,
              abi: ERC20_DECIMALS_ABI,
              functionName: "decimals",
            }),
          )
        } catch {
          toast.error("Could not read ERC-20 decimals for this address.")
          return
        }
        if (!Number.isInteger(token1Dec) || token1Dec < 0 || token1Dec > 255) {
          toast.error("Invalid ERC-20 decimals from contract.")
          return
        }

        const raw = humanToRawRatio(humanCenter, token0Dec, token1Dec)
        const centerTick = rawRatioToTick(raw)
        const spacing = tickSpacingForFee(customPairFee)
        let { tickLower, tickUpper } = wideTickBounds(centerTick, customPairFee)
        tickLower -= spacing
        tickUpper += spacing
        const MIN_TICK = -887272
        const MAX_TICK = 887272
        tickLower = Math.max(tickLower, MIN_TICK)
        tickUpper = Math.min(tickUpper, MAX_TICK)

        const initialSqrtPriceX96 = newPoolV4InitialSqrtPriceX96(humanCenter, token0Dec, token1Dec)

        toast.message("No v4 pool yet — requesting pool create + first position", {
          description: `Starting price ${rawPrice} (token per 1 ETH). Sign txs in order if prompted.`,
        })
        body = {
          ...common,
          newPool: {
            token0Address: currency0.toLowerCase(),
            token1Address: currency1.toLowerCase(),
            fee: customPairFee,
            tickSpacing,
            hooks: V4_NO_HOOKS,
            /** Full `sqrtPriceX96` integer string (Q64.96); token decimals already baked in here. */
            initialPrice: initialSqrtPriceX96,
          },
          /** Raw ticks — Uniswap `/lp/create` newPool requires `tickBounds` (human `priceBounds` yields 400 `tickPrice` mismatch, 906adf). */
          tickBounds: { tickLower, tickUpper },
        }
      }

      await switchChainAsync?.({ chainId })
      const chain = chainId === base.id ? base : baseSepolia

      let erc20Balance: bigint
      try {
        erc20Balance = (await publicClient.readContract({
          address: erc20,
          abi: ERC20_BALANCE_OF_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint
      } catch {
        toast.error("Could not read ERC-20 balance for approval check.")
        return
      }
      if (erc20Balance === BigInt(0)) {
        toast.error("Wallet holds 0 of this ERC-20 — mint or fund some before pairing with ETH.")
        return
      }

      const { batchPermitData, signature } = await prepareLpV4ApprovalsAndPermit({
        walletClient,
        publicClient,
        address: address as Address,
        chain,
        chainId,
        lpTokens: [{ tokenAddress: erc20.toLowerCase(), amount: erc20Balance.toString() }],
        action: "CREATE",
      })

      if (batchPermitData) (body as Record<string, unknown>).batchPermitData = batchPermitData
      if (signature) (body as Record<string, unknown>).signature = signature

      const lpRes = await fetch("/api/liquidity/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const lpJson = await lpRes.json()
      if (!lpRes.ok) {
        toast.error(typeof lpJson.error === "string" ? lpJson.error : "Liquidity API error")
        return
      }

      const txs = extractOrderedLpTransactionsClient(lpJson)
      if (!txs.length) {
        toast.error("No transactions in liquidity response.")
        return
      }

      let lastHash: `0x${string}` | undefined
      for (const tx of txs) {
        const h = await walletClient.sendTransaction({
          chain,
          account: address as `0x${string}`,
          to: tx.to,
          data: tx.data,
          value: tx.value ?? BigInt(0),
          gas: tx.gas,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        })
        lastHash = h
      }
      toast.success("Custom pair liquidity txs sent", { description: lastHash })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Custom pair liquidity failed")
    } finally {
      setCustomLpPending(false)
    }
  }, [
    address,
    walletClient,
    publicClient,
    chainId,
    pairErc20Address,
    customPairEthAmount,
    customPairFee,
    pairInitialPriceTokenPerEth,
    switchChainAsync,
  ])

  return (
    <div className="max-w-2xl mx-auto space-y-10 px-4 py-8">
      <WalletConnectSetupNote />

      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-black/40">Tools</p>
        <h1 className="text-2xl font-medium tracking-tight text-black">Liquidity lab</h1>
        <p className="text-sm text-black/55 leading-relaxed">
          Connect an external wallet, deploy an ERC-20, then add liquidity with{" "}
          <strong className="font-medium text-black/70">native ETH</strong> plus another token using{" "}
          <strong className="font-medium text-black/70">Uniswap v4</strong> and the Labs Liquidity API (
          <code className="font-mono text-[11px]">protocol: V4</code>, native currency{" "}
          <code className="font-mono text-[11px]">0x000…000</code>). Pools must already exist on-chain. For
          experimentation only — not audited.
        </p>
      </header>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-black">Wallet</h2>
            <p className="text-xs text-black/45 mt-1">Use Base Sepolia or Base mainnet in your wallet.</p>
          </div>
          <ConnectButton />
        </div>
        {isConnected && address && (
          <p className="mt-4 text-xs font-mono text-black/60 break-all">
            {address}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {CHAINS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchChainAsync?.({ chainId: c.id })}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-black/10 hover:bg-black/[0.03] transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-black">1 · Launch a test ERC-20</h2>
        <p className="text-xs text-black/45">
          Not official USDC — a minimal mintable ERC-20 you deploy for demos. You pay gas from your connected
          wallet.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-black/50">Name</span>
            <input
              value={tokenName}
              onChange={e => setTokenName(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-black/50">Symbol</span>
            <input
              value={tokenSymbol}
              onChange={e => setTokenSymbol(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-black/50">Decimals</span>
            <input
              type="number"
              min={0}
              max={18}
              value={tokenDecimals}
              onChange={e => setTokenDecimals(Number(e.target.value))}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-black/50">Initial supply (human)</span>
            <input
              value={tokenSupplyHuman}
              onChange={e => setTokenSupplyHuman(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!isConnected || deployPending}
          onClick={() => void deployLabToken()}
          className="text-sm px-4 py-2 rounded-xl bg-black text-white hover:bg-black/90 disabled:opacity-40"
        >
          {deployPending ? "Deploying…" : "Deploy token"}
        </button>
        <label className="block text-xs space-y-1">
          <span className="text-black/50">Deployed token address (optional — copied below for pairing)</span>
          <input
            value={deployedAddress ?? ""}
            onChange={e => setDeployedAddress(e.target.value.trim() || null)}
            placeholder="0x…"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm font-mono"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-black">2 · Add ETH + USDC liquidity (canonical pool)</h2>
        <p className="text-xs text-black/45">
          Uses the canonical <strong className="text-black/60">native ETH + USDC</strong> Uniswap v4 pool on this
          chain (same USDC as Rombo’s arena mapping). Current tick is read from the v4 PoolManager via RPC; the
          Liquidity API builds mint txs. You sign in your wallet.
        </p>
        <label className="text-xs space-y-1 block max-w-xs">
          <span className="text-black/50">ETH amount</span>
          <input
            value={ethAmount}
            onChange={e => setEthAmount(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!isConnected || lpPending}
          onClick={() => void addEthUsdcLiquidity()}
          className="text-sm px-4 py-2 rounded-xl border border-black/15 hover:bg-black/3 disabled:opacity-40"
        >
          {lpPending ? "Working…" : "Prepare & send LP transactions"}
        </button>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-black">3 · Pair your ERC-20 with ETH</h2>
        <p className="text-xs text-black/45">
          After you deploy a token in step 1, its address is filled here automatically; you can paste any ERC-20 on
          this chain. If a <strong className="text-black/60">native ETH + token</strong> v4 pool already exists at
          the fee tier, we add liquidity there. If not, the lab asks the Liquidity API to{" "}
          <strong className="text-black/60">create the pool</strong> at the initial price below, then mint a
          position (you may sign more than one transaction).
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="text-xs space-y-1 flex-1 min-w-0">
            <span className="text-black/50">ERC-20 token contract</span>
            <input
              value={pairErc20Address}
              onChange={e => setPairErc20Address(e.target.value)}
              placeholder="0x… (auto-filled after deploy)"
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm font-mono"
            />
          </label>
          {deployedAddress ? (
            <button
              type="button"
              onClick={() => setPairErc20Address(deployedAddress)}
              className="text-[11px] shrink-0 px-3 py-2 rounded-lg border border-black/10 hover:bg-black/3"
            >
              Use deployed token
            </button>
          ) : null}
        </div>
        <label className="text-xs space-y-1 block max-w-xs">
          <span className="text-black/50">ETH amount (native)</span>
          <input
            value={customPairEthAmount}
            onChange={e => setCustomPairEthAmount(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs space-y-1 block max-w-xs">
          <span className="text-black/50">
            Initial price if pool is new (ERC-20 per 1 ETH — positive decimal, sent as token1 per token0)
          </span>
          <input
            value={pairInitialPriceTokenPerEth}
            onChange={e => setPairInitialPriceTokenPerEth(e.target.value)}
            placeholder="10000"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-[11px] text-black/40">
          Fee tier: {customPairFee} (0.05%). Used for pool id and, when creating a pool, for tick spacing.
        </p>
        <button
          type="button"
          disabled={!isConnected || customLpPending}
          onClick={() => void addEthErc20PairLiquidity()}
          className="text-sm px-4 py-2 rounded-xl bg-black text-white hover:bg-black/90 disabled:opacity-40"
        >
          {customLpPending ? "Working…" : "Prepare & send LP for custom pair"}
        </button>
      </section>

      <section className="rounded-2xl border border-dashed border-black/15 bg-black/2 p-5 text-xs text-black/50 space-y-2">
        <p>
          Requires <code className="font-mono text-[11px]">UNISWAP_API_KEY</code> on the server (same as the rest
          of Rombo).
        </p>
      </section>
    </div>
  )
}
