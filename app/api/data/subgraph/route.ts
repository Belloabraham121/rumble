import { NextResponse } from "next/server"
import { fetchSubgraphEndpointDetails } from "@/lib/integrations/uniswap/subgraph"
import {
  parsePermittedSubgraphHttpUrl,
  redactSubgraphUrlForClient,
} from "@/lib/integrations/uniswap/subgraph-allowlist"
import { getRumbleServerEnv } from "@/lib/rumble/server-env"

export const dynamic = "force-dynamic"

/**
 * GET /api/data/subgraph
 * Optional `?url=` — full https URL of a GraphQL subgraph (allowlisted hosts only; same origin as
 * `UNISWAP_V3_SUBGRAPH_URL` is also accepted). Omitted → uses `UNISWAP_V3_SUBGRAPH_URL`.
 *
 * Returns `_meta` + optional Uniswap `bundles` ETH/USD probe for schema sanity.
 */
export async function GET(req: Request) {
  const env = getRumbleServerEnv()
  const { searchParams } = new URL(req.url)
  const rawOverride = searchParams.get("url")?.trim()

  let effectiveUrl: string
  if (rawOverride) {
    const u = parsePermittedSubgraphHttpUrl(rawOverride, env.uniswapV3SubgraphUrl)
    if (!u) {
      return NextResponse.json(
        {
          error:
            "Invalid or disallowed subgraph URL. Use an https URL on an allowed public indexer host, or the same origin as UNISWAP_V3_SUBGRAPH_URL.",
        },
        { status: 400 },
      )
    }
    effectiveUrl = u.toString()
  } else {
    if (!env.uniswapV3SubgraphUrl) {
      return NextResponse.json(
        { error: "UNISWAP_V3_SUBGRAPH_URL is not configured. Pass ?url= for a one-off subgraph." },
        { status: 503 },
      )
    }
    effectiveUrl = env.uniswapV3SubgraphUrl
  }

  try {
    const details = await fetchSubgraphEndpointDetails(effectiveUrl)
    return NextResponse.json({
      url: redactSubgraphUrlForClient(effectiveUrl),
      ...details,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: "Subgraph request failed",
        detail: message.slice(0, 800),
        url: redactSubgraphUrlForClient(effectiveUrl),
      },
      { status: 502 },
    )
  }
}
