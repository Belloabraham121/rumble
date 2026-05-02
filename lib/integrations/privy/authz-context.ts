import "server-only"

import type { AuthorizationContext } from "@privy-io/node"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import { normalizeAuthorizationPrivateKeyToPkcs8Base64 } from "@/lib/integrations/privy/pkcs8"

/** Builds Privy Wallet API authorization context from server env, or null if key missing. */
export function walletAuthorizationContext(): AuthorizationContext | null {
  const raw = getRumbleServerEnv().privyWalletAuthorizationPrivateKey
  if (!raw) return null
  try {
    const pk = normalizeAuthorizationPrivateKeyToPkcs8Base64(raw)
    return { authorization_private_keys: [pk] }
  } catch {
    return null
  }
}

/** Throws when agent/server signing is required but key is missing or invalid. */
export function requireWalletAuthorizationContext(): AuthorizationContext {
  const ctx = walletAuthorizationContext()
  if (!ctx?.authorization_private_keys?.length) {
    throw new Error("PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY is missing or invalid PEM/base64 PKCS8.")
  }
  return ctx
}
