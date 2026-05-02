import "server-only"

import { ethCall } from "@/lib/rumble/json-rpc"

const ERC20_DECIMALS = "0x313ce567" as const
const ERC20_SYMBOL = "0x95d89b41" as const

function stripHex(h: string): string {
  return h.startsWith("0x") ? h.slice(2) : h
}

/** Decode a `uint8` from a 32-byte-aligned eth_call return (low byte). */
function decodeUint8(hex: string): number | undefined {
  const raw = stripHex(hex)
  if (raw.length < 64) return undefined
  const last = raw.slice(-2)
  const n = Number.parseInt(last, 16)
  return Number.isFinite(n) && n >= 0 && n <= 255 ? n : undefined
}

/**
 * Decode a Solidity `string` from eth_call return (offset=0x20, uint256 length, bytes).
 * Falls back to `bytes32` legacy-token decoding when the payload is exactly one word.
 */
function decodeStringOrBytes32(hex: string): string | undefined {
  const raw = stripHex(hex)
  if (raw.length === 0) return undefined

  // Legacy bytes32: exactly one 32-byte word — treat as zero-padded ASCII.
  if (raw.length === 64) {
    const bytes: number[] = []
    for (let i = 0; i < raw.length; i += 2) {
      const b = Number.parseInt(raw.slice(i, i + 2), 16)
      if (b === 0) break
      bytes.push(b)
    }
    try {
      return new TextDecoder().decode(new Uint8Array(bytes))
    } catch {
      return undefined
    }
  }

  // Dynamic `string`: first word = offset (usually 0x20), next = length, then data.
  if (raw.length < 128) return undefined
  const offset = Number.parseInt(raw.slice(0, 64), 16)
  const headBytes = offset * 2
  if (!Number.isFinite(offset) || headBytes + 64 > raw.length) return undefined
  const length = Number.parseInt(raw.slice(headBytes, headBytes + 64), 16)
  if (!Number.isFinite(length) || length === 0) return undefined
  const bodyStart = headBytes + 64
  const bodyEnd = bodyStart + length * 2
  if (bodyEnd > raw.length) return undefined
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    bytes[i] = Number.parseInt(raw.slice(bodyStart + i * 2, bodyStart + i * 2 + 2), 16)
  }
  try {
    return new TextDecoder().decode(bytes).replace(/\u0000+$/g, "")
  } catch {
    return undefined
  }
}

export async function erc20DecimalsOnChain(rpcUrl: string, tokenAddress: string): Promise<number | undefined> {
  try {
    const hex = await ethCall(rpcUrl, tokenAddress, ERC20_DECIMALS)
    return decodeUint8(hex)
  } catch {
    return undefined
  }
}

export async function erc20SymbolOnChain(rpcUrl: string, tokenAddress: string): Promise<string | undefined> {
  try {
    const hex = await ethCall(rpcUrl, tokenAddress, ERC20_SYMBOL)
    const s = decodeStringOrBytes32(hex)?.trim()
    return s && s.length > 0 ? s.slice(0, 32) : undefined
  } catch {
    return undefined
  }
}
