import "server-only"

import { createHash } from "node:crypto"

/** Stable JSON stringify for hashing (sorted object keys). */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  function walk(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v
    if (seen.has(v as object)) return "[Circular]"
    seen.add(v as object)
    if (Array.isArray(v)) return v.map(walk)
    const o = v as Record<string, unknown>
    const keys = Object.keys(o).sort()
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      out[k] = walk(o[k])
    }
    return out
  }
  return JSON.stringify(walk(value))
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

export function hashPayloadForAudit(payload: unknown): string {
  return sha256Hex(stableStringify(payload))
}

export function extractUniswapRequestId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const id = (body as { requestId?: unknown }).requestId
  return typeof id === "string" ? id : undefined
}

export function extractRouting(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const r = (body as { routing?: unknown }).routing
  return typeof r === "string" ? r : undefined
}

/** Best-effort unix deadline from nested quote blobs (seconds or ms). */
export function extractQuoteDeadline(body: unknown): Date | undefined {
  const candidates: number[] = []

  function walk(v: unknown, depth: number) {
    if (depth > 12 || v === null || v === undefined) return
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v > 1e9) candidates.push(v)
      return
    }
    if (typeof v !== "object") return
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1)
      return
    }
    const o = v as Record<string, unknown>
    for (const key of Object.keys(o)) {
      const lk = key.toLowerCase()
      if (
        lk.includes("deadline") ||
        lk.includes("expiry") ||
        lk === "exp" ||
        lk.includes("expiration")
      ) {
        const val = o[key]
        if (typeof val === "number" && Number.isFinite(val)) candidates.push(val)
        if (typeof val === "string" && /^\d+$/.test(val)) {
          const n = Number(val)
          if (Number.isFinite(n)) candidates.push(n)
        }
      }
      walk(o[key], depth + 1)
    }
  }

  walk(body, 0)
  if (candidates.length === 0) return undefined

  const best = candidates.reduce((a, b) => (a > b ? a : b))
  const ms = best < 1e12 ? best * 1000 : best
  const d = new Date(ms)
  return Number.isFinite(d.getTime()) ? d : undefined
}

/** Pull swap calldata from `/swap` response for auditing / replay tooling. */
export function extractSwapCalldataHex(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const swap = (body as { swap?: unknown }).swap
  if (!swap || typeof swap !== "object") return undefined
  const mm = (swap as { methodParameters?: unknown }).methodParameters
  if (!mm || typeof mm !== "object") return undefined
  const cd = (mm as { calldata?: unknown }).calldata
  return typeof cd === "string" && cd.startsWith("0x") ? cd : undefined
}
