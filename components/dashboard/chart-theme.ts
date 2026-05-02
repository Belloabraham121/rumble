/**
 * Rumble marketing palette: warm paper, ink, soft borders, emerald accent
 * (same family as `app/page.tsx` + `SitePageShell`).
 */
export const chartTheme = {
  canvas: "#fafaf8",
  ink: "#111111",
  muted: "rgba(17,17,17,0.40)",
  mutedLight: "rgba(17,17,17,0.28)",
  grid: "rgba(17,17,17,0.06)",
  gridStrong: "rgba(17,17,17,0.09)",
  divider: "rgba(17,17,17,0.12)",
  /** Primary “neon” — emerald, used on hero metrics / live dots */
  accent: "#059669",
  accentBright: "#10b981",
  accentSoft: "rgba(16,185,129,0.14)",
  accentGlow: "rgba(16,185,129,0.35)",
  surface: "#ffffff",
  cellIdle: "rgba(255,255,255,0.92)",
  cellIdleStroke: "rgba(17,17,17,0.08)",
  cellActiveFill: "rgba(16,185,129,0.18)",
  cellActiveStroke: "rgba(5,150,105,0.55)",
  cellText: "rgba(17,17,17,0.42)",
  cellTextActive: "rgba(17,17,17,0.92)",
  bandStrokeSelected: "rgba(5,150,105,0.45)",
  bandStroke: "rgba(17,17,17,0.08)",
} as const
