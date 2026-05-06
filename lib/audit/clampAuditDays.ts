/** Max lookback for dealer audit API (GET /api/audit). */
export const MAX_AUDIT_DAYS = 90

export const DEFAULT_AUDIT_DAYS = 30

export function clampAuditDaysParam(days: number | null | undefined, fallback = DEFAULT_AUDIT_DAYS): number {
  let n = typeof days === 'number' ? days : parseInt(String(days ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) n = fallback
  return Math.min(MAX_AUDIT_DAYS, n)
}
