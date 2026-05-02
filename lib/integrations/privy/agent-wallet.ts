import "server-only"

import type { Wallet } from "@privy-io/node"
import { findAgentWallet, upsertAgentWalletRecord } from "@/lib/db/agent-wallets.repo"
import { requireWalletAuthorizationContext } from "@/lib/integrations/privy/authz-context"
import { getPrivyServerClient } from "@/lib/integrations/privy/server-client"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

/** Privy `external_id`: URL-safe, max 64 chars ([a-zA-Z0-9_-]). */
export function sanitizePrivyExternalId(agentId: string): string {
  const raw = `agent_${agentId}`.replace(/[^a-zA-Z0-9_-]/g, "_")
  return raw.length <= 64 ? raw : raw.slice(0, 64)
}

export type EnsureAgentWalletInput = {
  rumbleUserIdHex: string
  privyUserId: string
  agentId: string
}

/** Creates or returns the Privy programmatic wallet for an arena agent (owner = human Privy user). */
export async function ensureAgentPrivyWallet(input: EnsureAgentWalletInput): Promise<Wallet | null> {
  const existing = await findAgentWallet(input.rumbleUserIdHex, input.agentId)
  const client = getPrivyServerClient()

  if (!client) return null

  if (existing?.privyWalletId) {
    try {
      return await client.wallets().get(existing.privyWalletId)
    } catch {
      // fall through and recreate
    }
  }

  // Ensure authorization key is configured for later sign/broadcast; do not pass
  // `authorization_context` into `wallets().create` — current Privy Wallet API rejects it (400 unrecognized_keys).
  requireWalletAuthorizationContext()

  const policyIds = getRumbleServerEnv().privyDefaultPolicyIds
  const policySlice = policyIds[0] ? [policyIds[0]] : undefined

  const wallet = await client.wallets().create({
    chain_type: "ethereum",
    owner: { user_id: input.privyUserId },
    external_id: sanitizePrivyExternalId(input.agentId),
    policy_ids: policySlice,
    idempotency_key: `rumble-agent-${input.rumbleUserIdHex}-${input.agentId}`,
  })

  await upsertAgentWalletRecord({
    rumbleUserId: input.rumbleUserIdHex,
    agentId: input.agentId,
    chainId: getRumbleServerEnv().defaultChainId,
    privyWalletId: wallet.id,
    address: wallet.address,
    policyIds: policySlice,
  })

  return wallet
}
