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
import { parseUnits } from "viem"
import { toast } from "sonner"
import { base, baseSepolia } from "wagmi/chains"
import { getArenaPoolOnChain } from "@/lib/trading/arena-pool-onchain"
import type { RomboChainSlug } from "@/lib/rombo/chain-config"
import { MINIMAL_LAB_TOKEN_ABI, MINIMAL_LAB_TOKEN_BYTECODE } from "@/lib/liquidity-lab/minimal-lab-token.generated"
import { extractOrderedLpTransactionsClient } from "@/lib/liquidity-lab/lp-tx-from-response"
import { WalletConnectSetupNote } from "@/components/liquidity-lab/walletconnect-setup-note"

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

  const [ethAmount, setEthAmount] = useState("0.01")
  const [lpPending, setLpPending] = useState(false)

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
        toast.success("Token deployed", { description: addr })
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
    if (!address || !walletClient) {
      toast.error("Connect wallet")
      return
    }
    const meta = getArenaPoolOnChain("eth-usdc", activeSlug)
    if (!meta) {
      toast.error("This chain has no mapped ETH/USDC arena pool in Rombo config.")
      return
    }

    setLpPending(true)
    try {
      const poolRes = await fetch(
        `/api/liquidity-lab/pool-meta?arenaPoolId=eth-usdc&chainId=${meta.chainId}`,
        { credentials: "same-origin", cache: "no-store" },
      )
      const poolJson = (await poolRes.json()) as {
        poolAddress?: string | null
        tick?: string | null
        error?: string
      }
      if (!poolRes.ok) {
        toast.error(poolJson.error ?? "Could not load pool metadata (subgraph / Chainlink).")
        return
      }
      if (!poolJson.poolAddress || poolJson.poolAddress.startsWith("0x0000000000000")) {
        toast.error("Pool address unavailable — ensure subgraph or RPC can resolve this pair.")
        return
      }
      const tickNum = poolJson.tick != null ? Number.parseInt(String(poolJson.tick), 10) : NaN
      if (!Number.isFinite(tickNum)) {
        toast.error("Current pool tick unknown — cannot place a range safely.")
        return
      }

      const { tickLower, tickUpper } = wideTickBounds(tickNum, meta.feeTier)
      const weth = meta.token0.symbol === "WETH" ? meta.token0.address : meta.token1.address
      const amountWei = parseUnits(ethAmount, 18)
      const independentToken = {
        tokenAddress: weth.toLowerCase(),
        amount: amountWei.toString(),
      }

      const body = {
        idempotencyKey: `liquidity-lab-${Date.now()}`,
        walletAddress: address,
        chainId: meta.chainId,
        protocol: "V3",
        token0Address: meta.token0.address.toLowerCase(),
        token1Address: meta.token1.address.toLowerCase(),
        slippageTolerance: 0.5,
        simulateTransaction: false,
        existingPool: {
          token0Address: meta.token0.address.toLowerCase(),
          token1Address: meta.token1.address.toLowerCase(),
          poolReference: poolJson.poolAddress.toLowerCase(),
        },
        independentToken,
        tickBounds: { tickLower, tickUpper },
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

      await switchChainAsync?.({ chainId: meta.chainId })

      const chain = meta.chainId === base.id ? base : baseSepolia

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
  }, [address, walletClient, activeSlug, ethAmount, switchChainAsync])

  return (
    <div className="max-w-2xl mx-auto space-y-10 px-4 py-8">
      <WalletConnectSetupNote />

      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-black/40">Tools</p>
        <h1 className="text-2xl font-medium tracking-tight text-black">Liquidity lab</h1>
        <p className="text-sm text-black/55 leading-relaxed">
          Connect an external wallet (MetaMask, Rainbow, …), deploy a simple test ERC-20 (your own “USDC-style”
          token on testnet), and add V3 liquidity to the canonical WETH / USDC pair using Rombo’s Uniswap
          Liquidity API. This is for experimentation — not audited for production.
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
          <span className="text-black/50">Deployed token address (paste from wallet / explorer)</span>
          <input
            value={deployedAddress ?? ""}
            onChange={e => setDeployedAddress(e.target.value.trim() || null)}
            placeholder="0x…"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm font-mono"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-medium text-black">2 · Add WETH + USDC liquidity (canonical pool)</h2>
        <p className="text-xs text-black/45">
          Uses Rombo’s mapped WETH/USDC addresses for the selected chain, fetches pool tick from the server,
          then requests LP txs from Uniswap’s Liquidity API. You sign each transaction in your wallet.
        </p>
        <label className="text-xs space-y-1 block max-w-xs">
          <span className="text-black/50">WETH amount (ETH)</span>
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
          className="text-sm px-4 py-2 rounded-xl border border-black/15 hover:bg-black/[0.03] disabled:opacity-40"
        >
          {lpPending ? "Working…" : "Prepare & send LP transactions"}
        </button>
      </section>

      <section className="rounded-2xl border border-dashed border-black/15 bg-black/[0.02] p-5 text-xs text-black/50 space-y-2">
        <p>
          <strong className="text-black/70">Pairing your deployed token with WETH:</strong> create and seed a
          v3 pool on Uniswap for your token + WETH (fee tier 0.05% recommended), then you can add liquidity
          from the Uniswap app or extend this lab with a custom route.
        </p>
        <p>
          Requires <code className="font-mono text-[11px]">UNISWAP_API_KEY</code> on the server (same as the rest
          of Rombo).
        </p>
      </section>
    </div>
  )
}
