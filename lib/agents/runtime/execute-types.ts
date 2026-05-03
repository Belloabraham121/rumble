import type { AgentConfig } from "@/lib/agents/agent-types"

export type ExecuteAgentContext = {
  romboUserIdHex: string
  email?: string
  agentId: string
  privyWalletId: string
  walletAddress: string
  chainId: number
  config: AgentConfig
  idempotencyKey: string
}

export type ExecuteOutcome =
  | { ok: true; txHash?: string; summary: string }
  | { ok: false; summary: string; error?: string }
