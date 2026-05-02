import "server-only"

/**
 * Server-only Privy SDK wrapper — do not import from client components.
 *
 * Aligns with Privy Node setup: https://docs.privy.io/basics/nodeJS/setup
 * Authorization signatures for wallet APIs: https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server
 *
 * If you use a separate repo (e.g. “Marshmallow”) for signing flows, mirror its
 * `AuthorizationContext` usage here once this project can access that code.
 */

import { PrivyClient } from "@privy-io/node"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

let cached: PrivyClient | null | undefined

/** Returns null when `PRIVY_APP_ID` / `PRIVY_APP_SECRET` are unset. */
export function getPrivyServerClient(): PrivyClient | null {
  const env = getRumbleServerEnv()
  if (!env.hasPrivyApp || !env.privyAppId || !env.privyAppSecret) {
    cached = null
    return null
  }
  if (cached === undefined) {
    cached = new PrivyClient({
      appId: env.privyAppId,
      appSecret: env.privyAppSecret,
    })
  }
  return cached
}

/** Private key material for signing Wallet API requests (agent / automation). */
export function getPrivyWalletAuthorizationPrivateKey(): string | undefined {
  return getRumbleServerEnv().privyWalletAuthorizationPrivateKey
}

export { generateAuthorizationSignature, type AuthorizationContext } from "@privy-io/node"
