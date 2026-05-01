/** Human-readable labels for `vehicles.demand_signal` (migration 117). */

const SHORT: Record<string, string> = {
  high_demand: 'High demand',
  needs_price_drop: 'Price attention',
  needs_financing_push: 'Financing push',
  buy_signal: 'Buy signal',
}

export function demandSignalShortLabel(signal: string | null | undefined): string {
  if (!signal) return ''
  return SHORT[signal] ?? signal.replace(/_/g, ' ')
}
