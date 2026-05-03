import "server-only"

/**
 * SSRF guard for optional `?url=` subgraph overrides. Defaults still use env `UNISWAP_V3_SUBGRAPH_URL`.
 */
export function parsePermittedSubgraphHttpUrl(
  raw: string,
  envSubgraphUrl: string | undefined,
): URL | null {
  const s = raw.trim()
  if (!s) return null
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null

  const host = u.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host === "0.0.0.0"
  ) {
    return null
  }

  const allowedHost =
    host === "gateway.thegraph.com" ||
    host === "www.gateway.thegraph.com" ||
    host === "api.thegraph.com" ||
    host === "api.studio.thegraph.com" ||
    host === "api.goldsky.com" ||
    host.endsWith(".goldsky.io") ||
    host.endsWith(".sqd.network") ||
    host.endsWith(".substreams.dev")

  if (allowedHost) return u

  if (envSubgraphUrl) {
    try {
      const envU = new URL(envSubgraphUrl)
      if (u.origin === envU.origin) return u
    } catch {
      /* ignore */
    }
  }

  return null
}

/** Hide embedded gateway API keys from JSON clients. */
export function redactSubgraphUrlForClient(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean)
    const apiIdx = parts.indexOf("api")
    if (
      apiIdx >= 0 &&
      parts.length > apiIdx + 1 &&
      parts[apiIdx + 1] !== "subgraphs" &&
      parts[apiIdx + 1].length > 16
    ) {
      parts[apiIdx + 1] = "***"
      u.pathname = `/${parts.join("/")}`
    }
    return u.toString()
  } catch {
    return url
  }
}
