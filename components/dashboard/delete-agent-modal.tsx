"use client"

import { useEffect, useState } from "react"
import type { Agent } from "@/lib/agents/agent-types"

type Props = {
  open: boolean
  onClose: () => void
  agent: Agent | null
  onConfirmDelete: (agentId: string) => void
}

function fieldClass() {
  return "w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm text-[#111] placeholder:text-black/25 focus:outline-none focus:border-black/25 transition-colors"
}

export function DeleteAgentModal({ open, onClose, agent, onConfirmDelete }: Props) {
  const [confirmName, setConfirmName] = useState("")

  useEffect(() => {
    if (open) setConfirmName("")
  }, [open, agent?.id])

  if (!open || !agent) return null

  const agentId = agent.id
  const expected = agent.config.name.trim()
  const typed = confirmName.trim()
  const fallbackPhrase = "DELETE"
  const nameMatches =
    expected.length > 0 ? typed === expected : typed === fallbackPhrase

  function handleDelete() {
    if (!nameMatches) return
    onConfirmDelete(agentId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-agent-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-[#FBFAF6] shadow-[0_40px_120px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-start justify-between gap-3">
          <div>
            <p className="font-pixel text-[9px] tracking-[0.2em] text-red-700/80 uppercase">Destructive</p>
            <h3 id="delete-agent-title" className="text-base font-medium text-[#111]" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
              Delete agent?
            </h3>
            <p className="mt-2 text-[12px] text-black/50 leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-medium text-[#111]">&ldquo;{agent.config.name}&rdquo;</span>? This removes its
              execution history and settings from this browser. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center text-black/50 hover:text-black hover:bg-black/[0.04] transition-colors"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label htmlFor="delete-agent-confirm" className="block text-[10px] tracking-widest text-black/45 uppercase mb-1.5">
              {expected.length > 0 ? "Type the agent name to confirm" : `Type ${fallbackPhrase} to confirm`}
            </label>
            <input
              id="delete-agent-confirm"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={fieldClass()}
              placeholder={expected.length > 0 ? expected : fallbackPhrase}
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
            />
            <p className="mt-1.5 text-[10px] text-black/40">
              {expected.length > 0 ? (
                <>
                  Must match exactly: <span className="font-mono text-black/55">{expected}</span>
                </>
              ) : (
                <>
                  This agent has no name — type <span className="font-mono text-black/55">{fallbackPhrase}</span> to confirm.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-black/[0.06] flex items-center justify-end gap-2 bg-white/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-black/10 text-[11px] text-black/60 hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!nameMatches}
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-[11px] tracking-wide font-medium hover:bg-red-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            Delete agent
          </button>
        </div>
      </div>
    </div>
  )
}
