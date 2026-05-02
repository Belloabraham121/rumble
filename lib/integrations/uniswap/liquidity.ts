import "server-only"

import { getRumbleServerEnv } from "@/lib/rumble/server-env"
import { fetchUniswap, readUniswapJsonOrThrow } from "@/lib/integrations/uniswap/http"

function liquidityPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const base = getRumbleServerEnv().liquidityApiBase.replace(/\/$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  const url = `${base}${suffix}`
  return fetchUniswap(url, {
    method: "POST",
    body: JSON.stringify(body),
  }).then(readUniswapJsonOrThrow)
}

/** POST `/lp/check_approval` — LP token approvals before create / increase / decrease / migrate. */
export async function uniswapLpCheckApproval(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/check_approval", body)
}

/** POST `/lp/create` — mint a V3/V4 position (includes pool creation tx when the pool is missing). */
export async function uniswapLpCreate(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/create", body)
}

/** POST `/lp/increase` — add liquidity to an existing NFT position. */
export async function uniswapLpIncrease(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/increase", body)
}

/** POST `/lp/decrease` — reduce or exit liquidity. */
export async function uniswapLpDecrease(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/decrease", body)
}

/** POST `/lp/claim` — collect accrued LP fees. */
export async function uniswapLpClaimFees(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/claim", body)
}

/** POST `/lp/migrate` — e.g. migrate a V3 position toward V4 (pair stays consistent). */
export async function uniswapLpMigrate(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/migrate", body)
}

/** POST `/lp/claim_rewards` — incentive rewards where supported. */
export async function uniswapLpClaimRewards(body: Record<string, unknown>): Promise<unknown> {
  return liquidityPost("/lp/claim_rewards", body)
}
