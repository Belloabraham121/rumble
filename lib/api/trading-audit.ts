import "server-only"

import { getSession } from "@/lib/auth/session"
import {
  insertTradingAttempt,
  upsertWalletChainNonce,
  type TradingAttemptKind,
} from "@/lib/db/trading.repo"
import { getUserByEmail } from "@/lib/db/users.repo"
import { RomboUniswapError } from "@/lib/integrations/uniswap/errors"
import {
  extractQuoteDeadline,
  extractRouting,
  extractSwapCalldataHex,
  extractUniswapRequestId,
  hashPayloadForAudit,
} from "@/lib/integrations/uniswap/quote-metadata"

export type TradingAuditIdentity = {
  email: string
  romboUserIdHex?: string
}

export async function getTradingAuditIdentity(): Promise<TradingAuditIdentity | null> {
  const session = await getSession()
  if (!session) return null
  const user = await getUserByEmail(session.email)
  return {
    email: session.email,
    romboUserIdHex: user?._id.toHexString(),
  }
}

export function safeExcerpt(message: string, max = 400): string {
  return message.length <= max ? message : `${message.slice(0, max)}…`
}

export function logTradingAudit(input: {
  identity: TradingAuditIdentity | null
  kind: TradingAttemptKind
  agentId?: string
  idempotencyKey?: string
  payload?: unknown
  response?: unknown
  error?: unknown
  broadcastNonce?: number
  walletAddress?: string
  chainId?: number
  txHash?: string
}): void {
  void persistTradingAudit(input).catch(err => {
    console.error("[trading audit persist]", err)
  })
}

async function persistTradingAudit(input: {
  identity: TradingAuditIdentity | null
  kind: TradingAttemptKind
  agentId?: string
  idempotencyKey?: string
  payload?: unknown
  response?: unknown
  error?: unknown
  broadcastNonce?: number
  walletAddress?: string
  chainId?: number
  txHash?: string
}): Promise<void> {
  const status = input.error ? ("error" as const) : ("ok" as const)
  let errorCode: string | undefined
  let excerpt: string | undefined
  if (input.error instanceof RomboUniswapError) {
    errorCode = input.error.code
    excerpt = safeExcerpt(input.error.message)
  } else if (input.error instanceof Error) {
    excerpt = safeExcerpt(input.error.message)
  }

  const response = input.response
  const requestId = extractUniswapRequestId(response)
  const routing = extractRouting(response)
  const quoteExpiresAt = extractQuoteDeadline(response)
  const calldataHex = extractSwapCalldataHex(response)
  const calldataHash = calldataHex ? hashPayloadForAudit(calldataHex) : undefined
  const payloadHash = input.payload !== undefined ? hashPayloadForAudit(input.payload) : undefined

  await insertTradingAttempt({
    romboUserIdHex: input.identity?.romboUserIdHex,
    email: input.identity?.email,
    agentId: input.agentId,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    uniswapRequestId: requestId,
    routing,
    calldataHash,
    payloadHash,
    chainId: input.chainId,
    quoteExpiresAt,
    broadcastNonce: input.broadcastNonce,
    txHash: input.txHash,
    status,
    errorCode,
    excerpt,
  })

  if (
    status === "ok" &&
    input.walletAddress &&
    input.chainId !== undefined &&
    input.broadcastNonce !== undefined
  ) {
    await upsertWalletChainNonce({
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      nonce: input.broadcastNonce,
      txHash: input.txHash,
    })
  }
}
