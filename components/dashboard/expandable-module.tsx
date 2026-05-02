"use client"

import { useEffect, type ReactNode } from "react"

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Sizing preset for the content area. */
  size?: "md" | "lg"
}

export function ExpandedModule({ open, onClose, title, subtitle, children, size = "lg" }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const shell =
    size === "md"
      ? "w-full max-w-3xl h-[min(80vh,720px)]"
      : "w-full max-w-5xl h-[min(86vh,820px)]"

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`${shell} rounded-2xl border border-black/10 bg-[#FBFAF6] shadow-[0_40px_120px_rgba(0,0,0,0.22)] overflow-hidden flex flex-col`}>
        <div className="shrink-0 px-5 py-3 border-b border-black/[0.06] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-pixel text-[9px] tracking-[0.2em] text-black/40 uppercase">Expanded view</p>
            <h3
              className="text-base font-light text-[#111] truncate"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              {title}
            </h3>
            {subtitle && <p className="text-[10px] text-black/40 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center text-black/50 hover:text-black hover:bg-black/[0.05] transition-colors text-lg"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 p-4 md:p-5 bg-[#fafaf8]">
          <div className="h-full min-h-0">{children}</div>
        </div>
      </div>
    </div>
  )
}

type ExpandButtonProps = {
  onClick: () => void
  label?: string
}

export function ExpandButton({ onClick, label = "Expand" }: ExpandButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-full h-7 w-7 flex items-center justify-center text-black/45 hover:text-black hover:bg-black/[0.04] transition-colors"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 14v6h6" />
        <path d="M20 10V4h-6" />
        <path d="M14 4l6 6" />
        <path d="M10 20l-6-6" />
      </svg>
    </button>
  )
}
