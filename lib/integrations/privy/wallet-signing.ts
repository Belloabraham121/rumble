import "server-only"

import { requireWalletAuthorizationContext } from "@/lib/integrations/privy/authz-context"
import { getPrivyServerClient } from "@/lib/integrations/privy/server-client"

/** EIP-712 bundle accepted by Privy `eth_signTypedData_v4`. */
export type RomboEthereumTypedDataInput = {
  domain: Record<string, unknown>
  primary_type: string
  types: Record<string, Array<{ name: string; type: string }>>
  message: Record<string, unknown>
}

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

function caip2(chainId: number): `eip155:${number}` {
  return `eip155:${chainId}`
}

/** EIP-712 via Wallet API (`eth_signTypedData_v4`). */
export async function signEthereumTypedDataV4(input: {
  walletId: string
  typedData: RomboEthereumTypedDataInput
  idempotencyKey?: string
}): Promise<string> {
  const client = getPrivyServerClient()
  if (!client) {
    throw new Error("Privy server client is not configured (PRIVY_APP_ID / PRIVY_APP_SECRET).")
  }
  const authorization_context = requireWalletAuthorizationContext()

  const sig = await client.wallets().ethereum().signTypedData(input.walletId, {
    params: { typed_data: input.typedData as never },
    authorization_context,
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  })
  return sig.signature.startsWith("0x") ? sig.signature : `0x${sig.signature}`
}

/** Sign + broadcast an unsigned tx via Privy (`eth_sendTransaction`). */
export async function signAndBroadcastEthereumTransaction(input: {
  walletId: string
  chainId: number
  transaction: Record<string, unknown>
  idempotencyKey?: string
}): Promise<{ txHash: string }> {
  const client = getPrivyServerClient()
  if (!client) {
    throw new Error("Privy server client is not configured (PRIVY_APP_ID / PRIVY_APP_SECRET).")
  }
  const authorization_context = requireWalletAuthorizationContext()

  const out = await client.wallets().ethereum().sendTransaction(input.walletId, {
    caip2: caip2(input.chainId),
    params: { transaction: input.transaction as never },
    authorization_context,
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  })

  const hash = out.hash?.startsWith("0x") ? out.hash : `0x${out.hash}`
  return { txHash: hash.toLowerCase() }
}
