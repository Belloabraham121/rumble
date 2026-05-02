import "server-only"

import { createPrivateKey } from "node:crypto"

/** Privy expects base64 PKCS8 without PEM headers (`AuthorizationContext.authorization_private_keys`). */
export function normalizeAuthorizationPrivateKeyToPkcs8Base64(secret: string): string {
  const trimmed = secret.trim()
  if (!trimmed.includes("BEGIN")) {
    return trimmed.replace(/\s+/g, "")
  }
  const key = createPrivateKey(trimmed)
  const exported = key.export({ format: "der", type: "pkcs8" })
  return Buffer.from(exported).toString("base64")
}
