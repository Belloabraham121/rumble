import "server-only"

import {
  executionEndpointForRouting,
  parseRoutingFromQuoteResponse,
} from "@/lib/integrations/uniswap/routing"
import {
  uniswapCreateSwap,
  uniswapPostOrder,
  type UniswapTradingHeaders,
} from "@/lib/integrations/uniswap/trading"

function nestedQuote(quoteResponse: unknown): unknown {
  if (!quoteResponse || typeof quoteResponse !== "object") return undefined
  return (quoteResponse as { quote?: unknown }).quote
}

/**
 * After **`/quote`**, submit permit/order signature.
 * Classic / bridge / wrap → **`/swap`**; UniswapX routes → **`/order`**.
 */
export async function submitSignedSwapOrOrder(
  quoteResponse: unknown,
  signature: string,
  opts?: UniswapTradingHeaders & { refreshGasPrice?: boolean; simulateTransaction?: boolean },
): Promise<unknown> {
  const routing =
    parseRoutingFromQuoteResponse(quoteResponse) ??
    (() => {
      throw new Error("Quote response missing routing — cannot choose /swap vs /order.")
    })()

  const q = nestedQuote(quoteResponse)
  if (q === undefined) {
    throw new Error("Quote response missing quote payload.")
  }

  const { refreshGasPrice = false, simulateTransaction = false, ...headers } = opts ?? {}

  const permitData =
    quoteResponse && typeof quoteResponse === "object"
      ? (quoteResponse as { permitData?: unknown }).permitData
      : undefined

  if (executionEndpointForRouting(routing) === "order") {
    return uniswapPostOrder(
      {
        signature,
        quote: q,
        routing,
      },
      headers,
    )
  }

  return uniswapCreateSwap(
    {
      quote: q,
      signature,
      refreshGasPrice,
      simulateTransaction,
      ...(permitData !== undefined && permitData !== null ? { permitData } : {}),
    },
    headers,
  )
}
