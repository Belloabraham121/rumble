"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentActivityEvent } from "@/components/dashboard/activity-types";
import type { PriceBox } from "@/components/dashboard/types";
import {
  DEFAULT_AGENT_CONFIG,
  DEFAULT_RUNTIME_BOXES,
  migrateAgentConfig,
  migratePriceBox,
  type Agent,
  type AgentConfig,
  type AgentStatus,
  type AgentTotals,
} from "@/lib/agents/agent-types";

/** Coerce client/localStorage shapes so `PUT /api/agents/sync` passes server Zod validation. */
function normalizeAgentsForSync(list: Agent[]): Agent[] {
  return list.map((a) => ({
    ...a,
    config: migrateAgentConfig(a.config),
    boxes: (Array.isArray(a.boxes) ? a.boxes : []).map((b) => migratePriceBox(b)),
    totals: {
      pnlEth: Number.isFinite(a.totals?.pnlEth) ? a.totals.pnlEth : 0,
      gasGwei: Number.isFinite(a.totals?.gasGwei) ? a.totals.gasGwei : 0,
      fills: Number.isFinite(a.totals?.fills) ? a.totals.fills : 0,
      skips: Number.isFinite(a.totals?.skips) ? a.totals.skips : 0,
    },
    activity: Array.isArray(a.activity) ? a.activity : [],
    createdAt: typeof a.createdAt === "number" ? a.createdAt : Date.now(),
    status: a.status === "paused" ? "paused" : "running",
  }));
}

async function toastSyncFailure(res: Response) {
  let description = "Check your connection or try signing in again.";
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string" && j.error.trim()) {
      description = j.error.trim();
    }
  } catch {
    /* ignore */
  }
  toast.error("Could not save agents", { description });
}
import { toast } from "sonner";

const STORAGE_KEY = "rumble.agents.v1";

type CreateAgentInput = Partial<AgentConfig> & { name: string };

export type AgentsHydrationIssue = "mongo" | "auth" | null;

type AgentsContextValue = {
  agents: Agent[];
  ready: boolean;
  /** Set after first `/api/agents` attempt — ticks/sync need Mongo + session. */
  backendHydrated: boolean;
  /** Why agents could not load from the server (empty list + local-only). */
  agentsHydrationIssue: AgentsHydrationIssue;
  createAgent: (input: CreateAgentInput) => Agent;
  removeAgent: (id: string) => void;
  updateConfig: (id: string, patch: Partial<AgentConfig>) => void;
  updateBoxes: (id: string, boxes: PriceBox[]) => void;
  setStatus: (id: string, status: AgentStatus) => void;
};

const AgentsContext = createContext<AgentsContextValue | null>(null);

function newId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hydrateStoredAgent(raw: Record<string, unknown>): Agent {
  const cfgIn = raw.config as Partial<AgentConfig> | undefined;
  const cfg = migrateAgentConfig(cfgIn ?? {});
  const totalsIn = raw.totals as Partial<AgentTotals> | undefined;
  const totals: AgentTotals = {
    pnlEth: 0,
    gasGwei: 0,
    fills: 0,
    skips: 0,
    ...totalsIn,
  };
  const activity = Array.isArray(raw.activity)
    ? (raw.activity as AgentActivityEvent[])
    : [];
  let boxes: PriceBox[] = DEFAULT_RUNTIME_BOXES.map((b) => ({ ...b }));
  if (Array.isArray(raw.boxes) && raw.boxes.length > 0) {
    boxes = (raw.boxes as PriceBox[]).map((b) => migratePriceBox(b));
  }
  return {
    id: String(raw.id ?? newId()),
    status: raw.status === "paused" ? "paused" : "running",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    config: cfg,
    boxes,
    totals,
    activity,
  };
}

async function fetchSessionEmail(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      user?: { email?: string; embeddedWalletAddress?: string } | null;
    };
    const e = j.user?.email?.trim();
    return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  } catch {
    return null;
  }
}

export function AgentsStoreProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ready, setReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  /** After first `/api/agents` hydration attempt (Mongo may be off). */
  const [backendHydrated, setBackendHydrated] = useState(false);
  const [agentsHydrationIssue, setAgentsHydrationIssue] =
    useState<AgentsHydrationIssue>(null);
  const agentsRef = useRef<Agent[]>([]);
  agentsRef.current = agents;

  useEffect(() => {
    void fetchSessionEmail().then(setSessionEmail);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown[];
        if (Array.isArray(parsed))
          setAgents(
            parsed.map((p) => hydrateStoredAgent(p as Record<string, unknown>)),
          );
      }
    } catch {
      // ignore corrupted storage
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    } catch {
      // storage full / disabled — tolerate silently
    }
  }, [agents, ready]);

  /** Load agents from Mongo when logged in, or seed the server from localStorage. */
  useEffect(() => {
    if (!ready || !sessionEmail) return;
    let cancelled = false;

    async function hydrateFromApi() {
      try {
        const r = await fetch("/api/agents", { credentials: "same-origin" });
        if (cancelled) return;

        if (r.status === 503) {
          setAgentsHydrationIssue("mongo");
          setBackendHydrated(true);
          return;
        }
        if (r.status === 401) {
          setAgentsHydrationIssue("auth");
          setBackendHydrated(true);
          return;
        }

        if (!r.ok) {
          setAgentsHydrationIssue(null);
          setBackendHydrated(true);
          return;
        }

        setAgentsHydrationIssue(null);
        const j = (await r.json()) as { agents?: Agent[] };
        const remote = Array.isArray(j.agents) ? j.agents : [];
        if (remote.length > 0) {
          setAgents(remote);
        } else {
          const local = agentsRef.current;
          if (local.length > 0) {
            const syncRes = await fetch("/api/agents/sync", {
              method: "PUT",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agents: normalizeAgentsForSync(local) }),
            });
            if (
              !syncRes.ok &&
              syncRes.status !== 401 &&
              syncRes.status !== 503
            ) {
              void toastSyncFailure(syncRes);
            }
          }
        }
      } finally {
        if (!cancelled) setBackendHydrated(true);
      }
    }

    void hydrateFromApi();

    function onFocus() {
      void hydrateFromApi();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, sessionEmail]);

  /** Debounced push — keeps Mongo aligned with dashboard edits. */
  useEffect(() => {
    if (!ready || !sessionEmail || !backendHydrated || agents.length === 0)
      return;
    const t = window.setTimeout(() => {
      void fetch("/api/agents/sync", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: normalizeAgentsForSync(agents) }),
      }).then((res) => {
        if (!res.ok && res.status !== 401 && res.status !== 503) {
          void toastSyncFailure(res);
        }
      });
    }, 2800);
    return () => window.clearTimeout(t);
  }, [agents, backendHydrated, ready, sessionEmail]);

  const createAgent = useCallback<AgentsContextValue["createAgent"]>(
    (input) => {
      const id = newId();
      const next: Agent = {
        id,
        status: "running",
        createdAt: Date.now(),
        config: migrateAgentConfig({ ...DEFAULT_AGENT_CONFIG, ...input }),
        boxes: DEFAULT_RUNTIME_BOXES.map((b) => ({ ...b })),
        totals: { pnlEth: 0, gasGwei: 0, fills: 0, skips: 0 },
        activity: [],
      };
      setAgents((prev) => [...prev, next]);
      return next;
    },
    [],
  );

  const updateBoxes = useCallback<AgentsContextValue["updateBoxes"]>(
    (id, boxes) => {
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, boxes } : a)));
    },
    [],
  );

  const removeAgent = useCallback<AgentsContextValue["removeAgent"]>(
    (id) => {
      setAgents((prev) => prev.filter((a) => a.id !== id));
      void (async () => {
        if (!sessionEmail) return;
        await fetch(`/api/agents/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
      })();
    },
    [sessionEmail],
  );

  const updateConfig = useCallback<AgentsContextValue["updateConfig"]>(
    (id, patch) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, config: { ...a.config, ...patch } } : a,
        ),
      );
    },
    [],
  );

  const setStatus = useCallback<AgentsContextValue["setStatus"]>(
    (id, status) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
    },
    [],
  );

  const value = useMemo<AgentsContextValue>(
    () => ({
      agents,
      ready,
      backendHydrated,
      agentsHydrationIssue,
      createAgent,
      removeAgent,
      updateConfig,
      updateBoxes,
      setStatus,
    }),
    [
      agents,
      ready,
      backendHydrated,
      agentsHydrationIssue,
      createAgent,
      removeAgent,
      updateConfig,
      updateBoxes,
      setStatus,
    ],
  );

  return (
    <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
  );
}

export function useAgentsStore(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx)
    throw new Error(
      "useAgentsStore must be used inside <AgentsStoreProvider>.",
    );
  return ctx;
}

export function useAgent(id: string | undefined): Agent | null {
  const { agents } = useAgentsStore();
  return useMemo(
    () => (id ? (agents.find((a) => a.id === id) ?? null) : null),
    [agents, id],
  );
}
