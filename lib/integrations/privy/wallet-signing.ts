import "server-only"

import { requireWalletAuthorizationContext } from "@/lib/integrations/privy/authz-context"
import { getPrivyServerClient } from "@/lib/integrations/privy/server-client"

/**
 * Server-side personal_sign for an agent (or any) wallet using the authorization private key.
 * Requires `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY`.
 */
export async function signEthereumPersonalMessageWithAuthorizationKey(input: {
  walletId: string
  message: string | Uint8Array
  idempotencyKey?: string
}) {
  const client = getPrivyServerClient()
  if (!client) {
    throw new Error("Privy server client is not configured (PRIVY_APP_ID / PRIVY_APP_SECRET).")
  }
  const authorization_context = requireWalletAuthorizationContext()

  return client.wallets().ethereum().signMessage(input.walletId, {
    message: input.message,
    authorization_context,
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  })
}
