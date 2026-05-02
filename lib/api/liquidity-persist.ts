import "server-only"

import { upsertLpPositionByAgentPool } from "@/lib/db/lp-positions.repo"
import type { TradingAttemptKind } from "@/lib/db/trading.repo"
import {
  extractChainIdFromLpPayload,
  extractExistingPoolAddresses,
  extractLpNftTokenId,
} from "@/lib/integrations/uniswap/lp-metadata"

export async function maybePersistLpPositionFromLiquidityResponse(input: {
  romboUserIdHex?: string
  agentId?: string
  arenaPoolId?: string
  kind: TradingAttemptKind
  payload: Record<string, unknown>
  response: unknown
}): Promise<void> {
  if (input.kind !== "lp_create" && input.kind !== "lp_increase") return
  const agentId = input.agentId
  if (!agentId) return

  const nftTokenId = extractLpNftTokenId(input.response)
  if (!nftTokenId) return

  const chainId = extractChainIdFromLpPayload(input.payload)
  if (chainId === undefined) return

  const protocol =
    typeof input.payload.protocol === "string" ? input.payload.protocol : undefined
  const pool = extractExistingPoolAddresses(input.payload)

  await upsertLpPositionByAgentPool({
    romboUserIdHex: input.romboUserIdHex,
    agentId,
    arenaPoolId: input.arenaPoolId,
    chainId,
    protocol,
    nftTokenId,
    token0Address: pool.token0,
    token1Address: pool.token1,
    poolReference: pool.poolReference,
  })
}
