import { agentRunToPublic } from "@/lib/agents/agent-run-public"
import { findAgentForUser } from "@/lib/db/agents.repo"
import { listAgentRunsAfter } from "@/lib/db/agent-runs.repo"
import { getTradingAuditIdentity } from "@/lib/api/trading-audit"
import { getRomboServerEnv } from "@/lib/rombo/server-env"

export const dynamic = "force-dynamic"

/**
 * SSE stream of new agent runs (`event: run`). Polls Mongo every ~2s — suitable for chart arena flashes.
 */
export async function GET(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const env = getRomboServerEnv()
  if (!env.hasMongo) {
    return new Response("MongoDB is not configured.", { status: 503 })
  }

  const identity = await getTradingAuditIdentity()
  const romboUserIdHex = identity?.romboUserIdHex
  if (!romboUserIdHex) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { agentId } = await ctx.params
  const agent = await findAgentForUser(romboUserIdHex, agentId)
  if (!agent) {
    return new Response("Not found", { status: 404 })
  }

  let cursor = new Date()
  try {
    const u = new URL(req.url)
    const sinceRaw = u.searchParams.get("since")
    if (sinceRaw) {
      const d = new Date(sinceRaw)
      if (!Number.isNaN(d.getTime())) cursor = d
    }
  } catch {
    // ignore
  }

  const encoder = new TextEncoder()
  let stopped = false
  req.signal.addEventListener("abort", () => {
    stopped = true
  })

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 2500\n\n`))

      while (!stopped && !req.signal.aborted) {
        try {
          const docs = await listAgentRunsAfter({
            agentId,
            romboUserIdHex,
            since: cursor,
            limit: 80,
          })
          for (const doc of docs) {
            const pub = agentRunToPublic(doc)
            controller.enqueue(
              encoder.encode(`event: run\ndata: ${JSON.stringify({ run: pub })}\n\n`),
            )
            if (doc.createdAt > cursor) cursor = doc.createdAt
          }
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: {"message":"poll_failed"}\n\n`))
        }
        await new Promise<void>(resolve => {
          setTimeout(resolve, 2000)
        })
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
