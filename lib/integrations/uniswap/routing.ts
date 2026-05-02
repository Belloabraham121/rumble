/**
 * Route Uniswap quote `routing` values to execution endpoints.
 * Classic / bridge / wrap flows use **`/swap`**; UniswapX intents use **`/order`**.
 */

/** Routing values that require **`POST /v1/order`** (signed intent). */
export const UNISWAPX_ORDER_ROUTINGS = new Set<string>([
  "DUTCH_V2",
  "DUTCH_V3",
  "LIMIT_ORDER",
  "PRIORITY",
  "DUTCH_LIMIT",
])

export type UniswapExecutionEndpoint = "swap" | "order"

export function executionEndpointForRouting(routing: string): UniswapExecutionEndpoint {
  return UNISWAPX_ORDER_ROUTINGS.has(routing) ? "order" : "swap"
}

export function parseRoutingFromQuoteResponse(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const r = (body as { routing?: unknown }).routing
  return typeof r === "string" ? r : undefined
}
