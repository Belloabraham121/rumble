export type BoxAction = "swap" | "add_liquidity" | "remove_liquidity"

export type PriceBox = {
  id: string
  label: string
  low: number
  high: number
  action: BoxAction
  /** Fill/stroke tint, e.g. #6366f1 */
  color: string
  /** Shown on box hit overlay, e.g. "+0.12 ETH" */
  hitLabel: string
  /** % of capital allocated when this box fires (`agent.md`). */
  amountPercent?: string
}
