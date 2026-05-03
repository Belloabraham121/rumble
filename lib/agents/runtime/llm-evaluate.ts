import "server-only"

import { z } from "zod"
import type { ArenaPoolId } from "@/lib/agents/arena-pools"
import { getTradableArenaPools } from "@/lib/agents/arena-pools"
import {
  decisionForMatchedBox,
  evaluatePriceBoxes,
  type RuntimeDecision,
} from "./evaluate-boxes"
import { chartCoordFromUsd } from "@/lib/agents/runtime/chart-coord"
import type { AgentConfig } from "@/lib/agents/agent-types"
import type { PriceBox } from "@/components/dashboard/types"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export type DecisionSource = "llm" | "rules"

const llmResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip"), reason: z.string().max(400) }),
  z.object({ kind: z.literal("use_box"), box_id: z.string().min(1).max(120) }),
])

export async function evaluateRuntimeDecision(input: {
  displayUsd: number
  arenaPoolId: ArenaPoolId
  boxes: PriceBox[]
  config: AgentConfig
}): Promise<{ decision: RuntimeDecision; source: DecisionSource }> {
  const env = getRomboServerEnv()
  if (!env.openAiApiKey || !env.llmAgentEnabled) {
    return { decision: evaluatePriceBoxes(input), source: "rules" }
  }

  const llm = await tryOpenAiBoxPick(input, env.openAiApiKey, env.openAiModel)
  if (llm) {
    return llm
  }

  return { decision: evaluatePriceBoxes(input), source: "rules" }
}

async function tryOpenAiBoxPick(
  input: {
    displayUsd: number
    arenaPoolId: ArenaPoolId
    boxes: PriceBox[]
    config: AgentConfig
  },
  apiKey: string,
  model: string,
): Promise<{ decision: RuntimeDecision; source: "llm" } | null> {
  const { displayUsd, arenaPoolId, boxes, config } = input

  const tradable = getTradableArenaPools(config.tradeAllPools, config.enabledPoolIds)
  if (!tradable.some(p => p.id === arenaPoolId)) {
    return null
  }

  const coord = chartCoordFromUsd(displayUsd, arenaPoolId)

  const userPayload = {
    instruction:
      "You choose whether to act this tick using the agent goal and guardrails. Output JSON only.",
    schema: {
      kind: "skip | use_box",
      skip: { reason: "string" },
      use_box: { box_id: "id of exactly one price box from `boxes` whose numeric range contains `chartCoordinate`" },
    },
    agent: {
      goal: config.goal,
      riskLevel: config.riskLevel,
      slippagePercent: config.slippage,
      gasCapGwei: config.gasCap,
      maxPositionPercent: config.maxPositionPercent,
      approvedTokens: config.approvedTokens,
      betAmountEth: config.betAmount,
      chain: config.chain,
      poolLabel: config.pool,
    },
    market: {
      arenaPoolId,
      spotDisplayUsd: displayUsd,
      chartCoordinate: coord,
    },
    boxes: boxes.map(b => ({
      id: b.id,
      label: b.label,
      low: b.low,
      high: b.high,
      action: b.action,
      amountPercent: b.amountPercent,
    })),
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Rombo's autonomous trading policy model. The dashboard stores price boxes; each box defines low/high chart coordinates, an action (swap / add_liquidity / remove_liquidity), and sizing hints. You must output a single JSON object with either kind:\"skip\" and reason, or kind:\"use_box\" and box_id. Only pick use_box if chartCoordinate lies within that box's [low, high]. Respect risk — skip when uncertain or when no box clearly applies. Never invent box ids.",
          },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    })

    if (!res.ok) {
      return null
    }

    const raw = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = raw.choices?.[0]?.message?.content?.trim()
    if (!text) return null

    const parsedJson = JSON.parse(text) as unknown
    const normalized = normalizeLlmPayload(parsedJson)
    const parsed = llmResponseSchema.safeParse(normalized)
    if (!parsed.success) return null

    const data = parsed.data
    if (data.kind === "skip") {
      return {
        decision: { type: "skip", reason: `llm:${data.reason.slice(0, 200)}` },
        source: "llm",
      }
    }

    const hit = boxes.find(b => b.id === data.box_id)
    if (!hit) return null

    if (coord < hit.low || coord > hit.high) {
      return null
    }

    return {
      decision: decisionForMatchedBox(hit, arenaPoolId, config),
      source: "llm",
    }
  } catch {
    return null
  }
}

/** Accept loose keys from the model (`kind` vs inferred). */
function normalizeLlmPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const o = raw as Record<string, unknown>
  if (typeof o.kind === "string") return raw
  if (o.decision === "skip" || o.skip === true) {
    return {
      kind: "skip",
      reason: typeof o.reason === "string" ? o.reason : "skipped",
    }
  }
  const bid = o.box_id ?? o.boxId
  if (typeof bid === "string") {
    return { kind: "use_box", box_id: bid }
  }
  return raw
}
