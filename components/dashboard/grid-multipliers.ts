/** Multiplier for grid cell — higher away from visual “center” (reference UI). */
export function multiplierForCell(row: number, col: number, rows: number, cols: number): string {
  const cy = (rows - 1) / 2
  const cx = (cols - 1) / 2
  const dr = (row - cy) / Math.max(rows / 2, 1)
  const dc = (col - cx) / Math.max(cols / 2, 1)
  const d = Math.min(1.2, Math.sqrt(dr * dr + dc * dc))
  const m = 1 + d * 1.85
  return `${m.toFixed(2)}x`
}
