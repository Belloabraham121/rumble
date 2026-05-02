import "server-only"

import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/** Hints for IL / rebalance guardrails: Privy policies + optional env-driven rule string. */
export type LpPolicyHints = {
  privyPolicyIds: readonly string[]
  /** Raw `RUMBLE_LP_REBALANCE_POLICY` value for app-defined IL / rebalance rules. */
  rebalancePolicyRaw?: string
}

export function getLpPolicyHints(): LpPolicyHints {
  const env = getRumbleServerEnv()
  return {
    privyPolicyIds: env.privyDefaultPolicyIds,
    rebalancePolicyRaw: env.rumbleLpRebalancePolicy,
  }
}
