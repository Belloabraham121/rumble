"use client"

import { Toaster as Sonner } from "sonner"

/** Rumble-neutral toasts — matches dashboard borders / `#111` CTAs. */
export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors={false}
      closeButton
      toastOptions={{
        duration: 4200,
        classNames: {
          toast:
            "group rounded-xl border border-black/10 bg-white/95 text-[#111] shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-sm",
          title: "text-sm font-medium text-[#111]",
          description: "text-xs text-black/55 !text-black/55",
          actionButton:
            "!bg-[#111] !text-white rounded-lg text-xs font-medium",
          cancelButton: "!border-black/10 !text-[#111] rounded-lg text-xs",
          closeButton: "!border-black/10 !text-black/50",
          error:
            "!border-red-200 !bg-red-50/95 !text-red-950 [&_[data-description]]:!text-red-800/90",
          success:
            "!border-emerald-200/90 !bg-emerald-50/95 !text-emerald-950 [&_[data-description]]:!text-emerald-900/80",
          warning:
            "!border-amber-200 !bg-amber-50/95 !text-amber-950 [&_[data-description]]:!text-amber-900/80",
          info: "!border-black/10 !bg-white/95 !text-[#111]",
        },
      }}
    />
  )
}
