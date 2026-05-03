import { z } from "zod"
import { ARENA_POOL_IDS } from "@/lib/agents/arena-pools"

const arenaPoolIdSchema = z.enum(ARENA_POOL_IDS as unknown as [string, ...string[]])

const numericStr = (min: number, max: number, label: string) =>
  z
    .string()
    .min(1)
    .superRefine((s, ctx) => {
      const n = Number.parseFloat(s)
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
        return
      }
      if (n < min || n > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be between ${min} and ${max}`,
        })
      }
    })

export const agentConfigSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().max(8000),
  version: z.string().min(1).max(40),
  riskLevel: z.enum(["conservative", "balanced", "aggressive"]),
  capital: numericStr(0, 1e12, "capital"),
  token: z.string().min(1).max(20),
  chain: z.enum(["base-sepolia", "base-mainnet", "unichain-sepolia", "unichain-mainnet"]),
  basePair: z.string().min(1).max(80),
  feeTier: z.string().min(1).max(40),
  pool: z.string().min(1).max(120),
  slippage: numericStr(0, 50, "slippage"),
  gasCap: numericStr(1, 5000, "gasCap"),
  maxPositionPercent: numericStr(1, 100, "maxPositionPercent"),
  approvedTokens: z.string().min(1).max(500),
  betAmount: numericStr(0, 1000, "betAmount"),
  reflectionFrequencyTrades: numericStr(1, 10_000, "reflectionFrequencyTrades"),
  reflectionDepth: z.enum(["light", "standard", "deep"]),
  fundingNotes: z.string().max(2000),
  tradeAllPools: z.boolean(),
  enabledPoolIds: z.array(arenaPoolIdSchema).min(1),
  enabledLabPoolIds: z.array(z.string().min(1).max(200)).max(50).default([]),
  poolRemovalWarnings: z.array(z.string().max(500)).max(20).optional(),
})

export const priceBoxSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(200),
  low: z.number(),
  high: z.number(),
  action: z.enum(["swap", "add_liquidity", "remove_liquidity"]),
  color: z.string().max(40),
  hitLabel: z.string().max(400),
  amountPercent: z.string().max(10).optional(),
})

export const agentTotalsSchema = z.object({
  pnlEth: z.number(),
  gasGwei: z.number(),
  fills: z.number(),
  skips: z.number(),
})

export const agentSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["running", "paused"]),
  createdAt: z.number(),
  config: agentConfigSchema,
  boxes: z.array(priceBoxSchema).max(50),
  totals: agentTotalsSchema,
  activity: z.array(z.any()).max(5000),
})

/** Optional client-side config check (same rules as server). */
export function safeParseAgentConfig(cfg: unknown) {
  return agentConfigSchema.safeParse(cfg)
}

export type ParsedAgentConfig = z.infer<typeof agentConfigSchema>
export type ParsedAgent = z.infer<typeof agentSchema>
