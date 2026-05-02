import type { AgentConfig } from "@/lib/agents/agent-types"

export type ExecuteAgentContext = {
  rumbleUserIdHex: string
  email?: string
  agentId: string
  /**
   * Optional in sim mode (no Privy signing). Real-execution paths
   * (`execute-decision.ts`, `execute-agent-lp.ts`) still require it; the live
   * runtime is gated off by default in favour of `simulateAgentDecision`.
   */
  privyWalletId?: string
  walletAddress: string
  chainId: number
  config: AgentConfig
  idempotencyKey: string
}

export type ExecuteOutcome =
  | { ok: true; txHash?: string; summary: string }
  | { ok: false; summary: string; error?: string }
