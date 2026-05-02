import { cn } from "@/lib/utils"

type GlassCardProps = {
  children: React.ReactNode
  className?: string
}

/** Bento-style surface used on landing, auth, and dashboard. */
export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.07] bg-white overflow-hidden shadow-[0_28px_70px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  )
}
