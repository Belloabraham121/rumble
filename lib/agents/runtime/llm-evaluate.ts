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
import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import { clampToBand, getRiskBands } from "@/lib/agents/runtime/sim-economics"

export type DecisionSource = "llm" | "rules"

/**
 * Optional per-tick economics produced by the model in sim mode. When present,
 * the simulator clamps the multiplier to the agent's risk band and uses the
 * narrative as the activity-feed summary.
 */
export type AgentTickEconomics = {
  outcomeMultiplier: number
  narrative?: string
}

const llmResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip"), reason: z.string().max(400) }),
  z.object({
    kind: z.literal("use_box"),
    box_id: z.string().min(1).max(120),
    outcome_multiplier: z.number().optional(),
    narrative: z.string().max(280).optional(),
  }),
])

export async function evaluateRuntimeDecision(input: {
  displayUsd: number
  arenaPoolId: ArenaPoolId
  boxes: PriceBox[]
  config: AgentConfig
}): Promise<{
  decision: RuntimeDecision
  source: DecisionSource
  economics?: AgentTickEconomics
}> {
  const env = getRumbleServerEnv()
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
): Promise<{
  decision: RuntimeDecision
  source: "llm"
  economics?: AgentTickEconomics
} | null> {
  const { displayUsd, arenaPoolId, boxes, config } = input

  const tradable = getTradableArenaPools(config.tradeAllPools, config.enabledPoolIds)
  if (!tradable.some(p => p.id === arenaPoolId)) {
    return null
  }

  const coord = chartCoordFromUsd(displayUsd, arenaPoolId)
  const bands = getRiskBands(config.riskLevel)

  const userPayload = {
    instruction:
      "You drive a paper-money trading sim. Each tick decides whether to act and, if you act, the realised outcome. Output JSON only.",
    schema: {
      kind: "skip | use_box",
      skip: { reason: "short string" },
      use_box: {
        box_id: "id of exactly one price box from `boxes` whose numeric range contains `chartCoordinate`",
        outcome_multiplier:
          "stochastic realised multiplier on the *output* leg of the action — e.g. 1.0 = breakeven before gas, < 1 = loss, > 1 = profit. Pick a value that reflects market noise + the agent's risk appetite. Will be clamped server-side to the risk band.",
        narrative:
          "≤140-char punchy line for the activity feed (eg. 'snipe @ 2304 → +4.2% on momentum').",
      },
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
    risk_band: {
      outcome_multiplier_min: bands.swap.min,
      outcome_multiplier_max: bands.swap.max,
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
        temperature: 0.6,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Rumble's autonomous trading policy model running a paper-money sim. The dashboard stores price boxes; each box defines low/high chart coordinates, an action (swap / add_liquidity / remove_liquidity), and sizing hints. You must output a single JSON object with either kind:\"skip\" and reason, or kind:\"use_box\" with box_id, outcome_multiplier, and narrative. Only pick use_box if chartCoordinate lies within that box's [low, high]. Pick outcome_multiplier within risk_band.outcome_multiplier_min/max — favour values closer to 1.0 in calm regimes and spread wider when momentum or volatility is high. Outcomes can be losses (< 1.0) — trades go against you sometimes. Never invent box ids.",
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

    const economics: AgentTickEconomics | undefined =
      typeof data.outcome_multiplier === "number"
        ? {
            outcomeMultiplier: clampToBand(data.outcome_multiplier, bands.swap),
            narrative: data.narrative?.slice(0, 200),
          }
        : undefined

    return {
      decision: decisionForMatchedBox(hit, arenaPoolId, config),
      source: "llm",
      economics,
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
    const out: Record<string, unknown> = { kind: "use_box", box_id: bid }
    const mult = o.outcome_multiplier ?? o.outcomeMultiplier
    if (typeof mult === "number") out.outcome_multiplier = mult
    const nar = o.narrative
    if (typeof nar === "string") out.narrative = nar
    return out
  }
  return raw
}
