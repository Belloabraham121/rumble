import "server-only"

type Eip712Types = Record<string, Array<{ name: string; type: string }>>

/** Walk a Uniswap `/quote` JSON blob and return the first EIP-712 object we can feed Privy. */
export function tryExtractEip712FromQuote(root: unknown): {
  domain: Record<string, unknown>
  types: Eip712Types
  primary_type: string
  message: Record<string, unknown>
} | null {
  const stack: unknown[] = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object") continue
    const o = cur as Record<string, unknown>

    const primary =
      (typeof o.primaryType === "string" ? o.primaryType : null) ??
      (typeof o.primary_type === "string" ? o.primary_type : null)

    if (
      primary &&
      o.domain &&
      typeof o.domain === "object" &&
      o.types &&
      typeof o.types === "object" &&
      o.message &&
      typeof o.message === "object"
    ) {
      return {
        domain: o.domain as Record<string, unknown>,
        types: o.types as Eip712Types,
        primary_type: primary,
        message: o.message as Record<string, unknown>,
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === "object") stack.push(v)
    }
  }
  return null
}
