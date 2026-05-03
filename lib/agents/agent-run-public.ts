import type { AgentRunDecision, AgentRunDoc } from "@/lib/db/agent-runs.repo"

export type ArenaOutcomeKind = "hit" | "skip" | "error"

/** API-facing row — safe for dashboards + SSE (no romboUserIdHex). */
export type AgentRunPublic = {
  id: string
  createdAt: string
  arenaPoolId?: string
  decision: AgentRunDecision
  summary: string
  arena: {
    outcome: ArenaOutcomeKind
    mult: number
    payoutEth: number
  }
}

function arenaOutcomeFromDecision(d: AgentRunDecision): ArenaOutcomeKind {
  if (d === "swap") return "hit"
  if (d === "error") return "error"
  return "skip"
}

function numDetail(d: AgentRunDoc["detail"], key: string): number | undefined {
  if (!d || typeof d !== "object") return undefined
  const v = (d as Record<string, unknown>)[key]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export function agentRunToPublic(run: AgentRunDoc): AgentRunPublic {
  const d = run.detail
  const mult = numDetail(d, "arenaMult") ?? (run.decision === "swap" ? 2 : 1)
  const payoutEth = numDetail(d, "arenaPayoutEth") ?? 0
  return {
    id: run._id.toHexString(),
    createdAt: run.createdAt.toISOString(),
    arenaPoolId: run.arenaPoolId,
    decision: run.decision,
    summary: run.summary,
    arena: {
      outcome: arenaOutcomeFromDecision(run.decision),
      mult,
      payoutEth,
    },
  }
}
