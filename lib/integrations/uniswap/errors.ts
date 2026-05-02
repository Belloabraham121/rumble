/**
 * Stable Rombo error codes for Uniswap Labs HTTP APIs (Trading + Liquidity).
 * Map HTTP status + optional body text → classify failures for logs/UI/Mongo.
 *
 * Official troubleshooting: https://developers.uniswap.org/docs/trading/swapping-api/common-errors
 */

export const UNISWAP_ERROR_CODES = {
  /** Server env — `UNISWAP_API_KEY` unset */
  MISSING_API_KEY: "UNISWAP_MISSING_API_KEY",
  /** HTTP 429 — default 6 RPS exceeded */
  RATE_LIMITED: "UNISWAP_RATE_LIMITED",
  /** HTTP 404 — often “No quotes available” (see docs for causes) */
  NO_QUOTE: "UNISWAP_NO_QUOTE",
  /** HTTP 400 — validation / malformed payload */
  VALIDATION: "UNISWAP_VALIDATION",
  /** HTTP 401 — missing/invalid x-api-key or bad Accept/Content-Type */
  UNAUTHORIZED: "UNISWAP_UNAUTHORIZED",
  /** HTTP 500 — upstream server error */
  SERVER_ERROR: "UNISWAP_SERVER_ERROR",
  /** HTTP 504 — gateway timeout */
  GATEWAY_TIMEOUT: "UNISWAP_GATEWAY_TIMEOUT",
  /** Network / fetch threw */
  NETWORK: "UNISWAP_NETWORK",
  UNKNOWN: "UNISWAP_UNKNOWN",
} as const

export type UniswapErrorCode = (typeof UNISWAP_ERROR_CODES)[keyof typeof UNISWAP_ERROR_CODES]

export type ClassifyUniswapFailureInput = {
  httpStatus: number
  /** Raw response body text (first ~2k safe chars) */
  bodyText?: string
}

export class RomboUniswapError extends Error {
  readonly code: UniswapErrorCode
  readonly httpStatus?: number
  readonly requestId?: string

  constructor(
    code: UniswapErrorCode,
    message: string,
    options?: { httpStatus?: number; requestId?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined)
    this.name = "RomboUniswapError"
    this.code = code
    this.httpStatus = options?.httpStatus
    this.requestId = options?.requestId
  }
}

/** Best-effort extract `requestId` from JSON body if present */
function tryParseRequestId(bodyText: string): string | undefined {
  try {
    const j = JSON.parse(bodyText) as { requestId?: string }
    return typeof j.requestId === "string" ? j.requestId : undefined
  } catch {
    return undefined
  }
}

/**
 * Classify an Uniswap HTTP failure into a stable code + RomboUniswapError.
 */
export function classifyUniswapHttpFailure(input: ClassifyUniswapFailureInput): RomboUniswapError {
  const { httpStatus, bodyText = "" } = input
  const lower = bodyText.toLowerCase()
  const requestId = bodyText.length > 0 ? tryParseRequestId(bodyText) : undefined

  switch (httpStatus) {
    case 429:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.RATE_LIMITED,
        "Uniswap API rate limit exceeded (default 6 RPS per key). Pause and retry with backoff.",
        { httpStatus, requestId },
      )
    case 401:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.UNAUTHORIZED,
        "Uniswap API unauthorized — check x-api-key and Accept/Content-Type: application/json.",
        { httpStatus, requestId },
      )
    case 400:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.VALIDATION,
        bodyText.slice(0, 500) || "Uniswap API validation error (400).",
        { httpStatus, requestId },
      )
    case 404:
      if (lower.includes("no quotes") || lower.includes("no quote")) {
        return new RomboUniswapError(
          UNISWAP_ERROR_CODES.NO_QUOTE,
          "No quotes available — check min UniswapX notionals, chain/token addresses, and bridge+swap rules.",
          { httpStatus, requestId },
        )
      }
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.NO_QUOTE,
        bodyText.slice(0, 500) || "Uniswap API returned 404.",
        { httpStatus, requestId },
      )
    case 500:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.SERVER_ERROR,
        "Uniswap API server error (500). Retry with backoff.",
        { httpStatus, requestId },
      )
    case 504:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.GATEWAY_TIMEOUT,
        "Uniswap API gateway timeout (504). Retry with backoff.",
        { httpStatus, requestId },
      )
    default:
      return new RomboUniswapError(
        UNISWAP_ERROR_CODES.UNKNOWN,
        `Uniswap API error (HTTP ${httpStatus}). ${bodyText.slice(0, 300)}`,
        { httpStatus, requestId },
      )
  }
}

export function classifyUniswapNetworkFailure(err: unknown): RomboUniswapError {
  const msg = err instanceof Error ? err.message : String(err)
  return new RomboUniswapError(UNISWAP_ERROR_CODES.NETWORK, msg, {
    cause: err instanceof Error ? err : undefined,
  })
}
