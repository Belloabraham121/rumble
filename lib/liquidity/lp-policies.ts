import "server-only"

import { getRomboServerEnv } from "@/lib/rombo/server-env"

/** Hints for IL / rebalance guardrails: Privy policies + optional env-driven rule string. */
export type LpPolicyHints = {
  privyPolicyIds: readonly string[]
  /** Raw `ROMBO_LP_REBALANCE_POLICY` value for app-defined IL / rebalance rules. */
  rebalancePolicyRaw?: string
}

export function getLpPolicyHints(): LpPolicyHints {
  const env = getRomboServerEnv()
  return {
    privyPolicyIds: env.privyDefaultPolicyIds,
    rebalancePolicyRaw: env.romboLpRebalancePolicy,
  }
}
