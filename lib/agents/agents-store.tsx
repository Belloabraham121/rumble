"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { AgentActivityEvent, ArenaResolutionPayload } from "@/components/dashboard/activity-types"
import { buildActivityFromHit } from "@/components/dashboard/synthesize-activity"
import {
  DEFAULT_AGENT_CONFIG,
  type Agent,
  type AgentConfig,
  type AgentStatus,
  type AgentTotals,
} from "@/lib/agents/agent-types"

const STORAGE_KEY = "rombo.agents.v1"
const MAX_EVENTS_PER_AGENT = 120
const BACKGROUND_TICK_MS = 850
/** Skip the background tick for an agent if its chart just fired a resolution within this window. */
const LIVE_DRIVE_GRACE_MS = 1500

type CreateAgentInput = Partial<AgentConfig> & { name: string }

type AgentsContextValue = {
  agents: Agent[]
  ready: boolean
  createAgent: (input: CreateAgentInput) => Agent
  removeAgent: (id: string) => void
  updateConfig: (id: string, patch: Partial<AgentConfig>) => void
  setStatus: (id: string, status: AgentStatus) => void
  recordResolution: (id: string, payload: ArenaResolutionPayload) => void
}

const AgentsContext = createContext<AgentsContextValue | null>(null)

function newId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampActivity(events: AgentActivityEvent[]): AgentActivityEvent[] {
  if (events.length <= MAX_EVENTS_PER_AGENT) return events
  return events.slice(-MAX_EVENTS_PER_AGENT)
}

function applyEventToTotals(totals: AgentTotals, ev: AgentActivityEvent): AgentTotals {
  const gas = ev.gasGwei ?? 0
  if (ev.kind === "box_skipped") {
    return { ...totals, skips: totals.skips + 1, gasGwei: totals.gasGwei + gas }
  }
  return {
    ...totals,
    fills: totals.fills + 1,
    pnlEth: totals.pnlEth + (ev.pnlEth ?? 0),
    gasGwei: totals.gasGwei + gas,
  }
}

function simulateBackgroundPayload(): ArenaResolutionPayload {
  const hit = Math.random() < 0.55
  const mult = 1.1 + Math.random() * 3.1
  const payoutEth = hit ? 0.1 * mult : 0
  return { hit, mult, payoutEth }
}

export function AgentsStoreProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [ready, setReady] = useState(false)
  /** Map<agentId, epochMs> of when that agent's chart last recorded a resolution. */
  const liveDriveAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Agent[]
        if (Array.isArray(parsed)) setAgents(parsed)
      }
    } catch {
      // ignore corrupted storage
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
    } catch {
      // storage full / disabled — tolerate silently
    }
  }, [agents, ready])

  const createAgent = useCallback<AgentsContextValue["createAgent"]>(input => {
    const id = newId()
    const next: Agent = {
      id,
      status: "running",
      createdAt: Date.now(),
      config: { ...DEFAULT_AGENT_CONFIG, ...input },
      totals: { pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 },
      activity: [],
    }
    setAgents(prev => [...prev, next])
    return next
  }, [])

  const removeAgent = useCallback<AgentsContextValue["removeAgent"]>(id => {
    setAgents(prev => prev.filter(a => a.id !== id))
    liveDriveAtRef.current.delete(id)
  }, [])

  const updateConfig = useCallback<AgentsContextValue["updateConfig"]>((id, patch) => {
    setAgents(prev =>
      prev.map(a => (a.id === id ? { ...a, config: { ...a.config, ...patch } } : a)),
    )
  }, [])

  const setStatus = useCallback<AgentsContextValue["setStatus"]>((id, status) => {
    setAgents(prev => prev.map(a => (a.id === id ? { ...a, status } : a)))
  }, [])

  const appendResolution = useCallback((id: string, payload: ArenaResolutionPayload, sampleSkip: boolean) => {
    // Reduce skip-noise in the activity log (1/6 survive). Non-skip events always log.
    if (!payload.hit && sampleSkip && Math.random() > 1 / 6) return
    const ev = buildActivityFromHit(payload)
    setAgents(prev =>
      prev.map(a => {
        if (a.id !== id) return a
        return {
          ...a,
          activity: clampActivity([...a.activity, ev]),
          totals: applyEventToTotals(a.totals, ev),
        }
      }),
    )
  }, [])

  const recordResolution = useCallback<AgentsContextValue["recordResolution"]>(
    (id, payload) => {
      liveDriveAtRef.current.set(id, Date.now())
      appendResolution(id, payload, true)
    },
    [appendResolution],
  )

  // Background tick: for each running agent, if its chart hasn't driven a
  // resolution in the last 1.5s, we synthesize one here. This is what makes
  // agents continue "running" while the user is on the overview page (or
  // viewing a different agent's trading board).
  useEffect(() => {
    if (!ready) return
    const handle = window.setInterval(() => {
      const now = Date.now()
      const liveMap = liveDriveAtRef.current
      const runningIds = agents.filter(a => a.status === "running").map(a => a.id)
      for (const id of runningIds) {
        const lastLive = liveMap.get(id) ?? 0
        if (now - lastLive < LIVE_DRIVE_GRACE_MS) continue
        appendResolution(id, simulateBackgroundPayload(), false)
      }
    }, BACKGROUND_TICK_MS)
    return () => window.clearInterval(handle)
  }, [ready, agents, appendResolution])

  const value = useMemo<AgentsContextValue>(
    () => ({ agents, ready, createAgent, removeAgent, updateConfig, setStatus, recordResolution }),
    [agents, ready, createAgent, removeAgent, updateConfig, setStatus, recordResolution],
  )

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
}

export function useAgentsStore(): AgentsContextValue {
  const ctx = useContext(AgentsContext)
  if (!ctx) throw new Error("useAgentsStore must be used inside <AgentsStoreProvider>.")
  return ctx
}

export function useAgent(id: string | undefined): Agent | null {
  const { agents } = useAgentsStore()
  return useMemo(() => (id ? agents.find(a => a.id === id) ?? null : null), [agents, id])
}
