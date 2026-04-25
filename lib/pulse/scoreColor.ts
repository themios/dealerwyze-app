/**
 * Shared color helpers for pulse survey scores (1–5 scale).
 * Do NOT use for the dealer performance score (0–100) in DealerScoreTile.
 */

/** Returns a semantic color token for a 1–5 pulse score. */
export function pulseScoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null || s < 3.5) return 'red'
  if (s < 4.5) return 'yellow'
  return 'green'
}

/** Returns the full Tailwind class string for the PulseScoreWidget button. */
export function pulseScoreWidgetClasses(s: number | null): string {
  if (s === null) return 'text-muted-foreground bg-muted border-border'
  if (s >= 4.5)  return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5)  return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
