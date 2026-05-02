import "server-only"

/**
 * Best-effort extraction of an LP position NFT id from Liquidity API JSON.
 * Schemas evolve — verify against the latest OpenAPI when wiring persistence.
 */
export function extractLpNftTokenId(data: unknown): string | undefined {
  const seen = new WeakSet<object>()

  function walk(v: unknown): string | undefined {
    if (!v || typeof v !== "object") return
    if (seen.has(v)) return
    seen.add(v as object)

    const o = v as Record<string, unknown>
    for (const key of [
      "nftTokenId",
      "nft_token_id",
      "tokenId",
      "token_id",
      "v3NftTokenId",
      "v3_nft_token_id",
      "positionId",
      "position_id",
    ]) {
      const x = o[key]
      if (typeof x === "number" && Number.isFinite(x)) return String(Math.trunc(x))
      if (typeof x === "string") {
        const t = x.trim()
        if (/^\d+$/.test(t)) return t
      }
    }

    for (const val of Object.values(o)) {
      const hit = walk(val)
      if (hit) return hit
    }
    return
  }

  return walk(data)
}

export function extractChainIdFromLpPayload(body: Record<string, unknown>): number | undefined {
  const raw = body.chainId ?? body.chain_id
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string") {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return
}

export function extractExistingPoolAddresses(body: Record<string, unknown>): {
  token0?: string
  token1?: string
  poolReference?: string
} {
  const ep = body.existingPool ?? body.existing_pool
  if (!ep || typeof ep !== "object") return {}
  const e = ep as Record<string, unknown>
  const token0 =
    typeof e.token0Address === "string"
      ? e.token0Address
      : typeof e.token_0_address === "string"
        ? e.token_0_address
        : undefined
  const token1 =
    typeof e.token1Address === "string"
      ? e.token1Address
      : typeof e.token_1_address === "string"
        ? e.token_1_address
        : undefined
  const poolReference =
    typeof e.poolReference === "string"
      ? e.poolReference
      : typeof e.pool_reference === "string"
        ? e.pool_reference
        : undefined
  return { token0, token1, poolReference }
}
