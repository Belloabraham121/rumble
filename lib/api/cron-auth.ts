import "server-only"

import { getRomboServerEnv } from "@/lib/rombo/server-env"

/**
 * Allow a request to hit `/api/cron/*` if:
 *  - `x-rombo-cron-secret` or `?token=` matches `ROMBO_CRON_SECRET`, OR
 *  - the request carries Vercel's `x-vercel-cron: 1` header (internal invocation), OR
 *  - no secret is configured (permissive for local dev).
 */
export function isCronRequestAuthorized(req: Request): boolean {
  const env = getRomboServerEnv()

  if (req.headers.get("x-vercel-cron") === "1") return true

  if (!env.cronSecret) return true

  const fromHeader = req.headers.get("x-rombo-cron-secret") ?? ""
  if (fromHeader && fromHeader === env.cronSecret) return true

  try {
    const url = new URL(req.url)
    const fromQuery = url.searchParams.get("token") ?? ""
    if (fromQuery && fromQuery === env.cronSecret) return true
  } catch {
    // bad URL — reject
  }

  return false
}
