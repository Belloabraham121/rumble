import "server-only"

import { ARENA_POOL_BY_ID, ARENA_POOL_IDS, type ArenaPoolId } from "@/lib/agents/arena-pools"
import { agentSchema } from "@/lib/agents/agent-schema"
import type { Agent, AgentConfig } from "@/lib/agents/agent-types"
import { z } from "zod"

export type AgentValidationResult =
  | { ok: true; agent: z.infer<typeof agentSchema> }
  | { ok: false; error: string; issues?: z.ZodIssue[] }

function enabledPoolSet(cfg: AgentConfig): Set<ArenaPoolId> {
  const ids = cfg.tradeAllPools ? [...ARENA_POOL_IDS] : cfg.enabledPoolIds
  return new Set(ids)
}

/** Pools that were tradable before but not after this config change — LP may still be open. */
export function removedArenaPools(prev: AgentConfig | undefined, next: AgentConfig): ArenaPoolId[] {
  if (!prev) return []
  const before = enabledPoolSet(prev)
  const after = enabledPoolSet(next)
  return [...before].filter(id => !after.has(id))
}

export function applyPoolRemovalWarnings(prev: AgentConfig | undefined, next: AgentConfig): AgentConfig {
  const removed = removedArenaPools(prev, next)
  const warnings =
    removed.length > 0
      ? removed.map(id => {
          const label = ARENA_POOL_BY_ID[id]?.label ?? id
          return `Pool ${label} was removed from trading — close or migrate open LP on that pair if any.`
        })
      : []
  return { ...next, poolRemovalWarnings: warnings.length > 0 ? warnings : [] }
}

export function validateAgentPayload(raw: unknown): AgentValidationResult {
  const parsed = agentSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".") || "root"}: ${i.message}`).join("; ")
    return { ok: false, error: msg, issues: parsed.error.issues }
  }
  return { ok: true, agent: parsed.data }
}

/** Validates + merges pool-removal warnings before Mongo upsert. */
export function prepareAgentForUpsert(agent: Agent, previousConfig?: AgentConfig): Agent {
  const v = validateAgentPayload(agent)
  if (!v.ok) {
    throw new Error(v.error)
  }
  const mergedConfig = applyPoolRemovalWarnings(previousConfig, v.agent.config as AgentConfig)
  return {
    ...(v.agent as unknown as Agent),
    config: mergedConfig,
  }
}
