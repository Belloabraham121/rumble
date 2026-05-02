import { cn } from "@/lib/utils"

type SitePageShellProps = {
  children: React.ReactNode
  className?: string
}

/** Shared canvas: warm paper background + text color from the landing page. */
export function SitePageShell({ children, className }: SitePageShellProps) {
  return (
    <div className={cn("min-h-screen bg-[#F5F4F0] text-[#111] font-sans antialiased", className)}>
      {children}
    </div>
  )
}
