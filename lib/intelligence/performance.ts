import { canAccessReports } from '@/lib/auth/dealerRoles'
import type { Profile } from '@/lib/auth/profile'

export const PERFORMANCE_DAY_OPTIONS = [7, 30, 90] as const

export function canManagePerformance(profile: Pick<Profile, 'role'>): boolean {
  return canAccessReports(profile.role)
}

export function clampPerformanceDays(raw: string | null | undefined, fallback = 30): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback
  if (parsed === 7 || parsed === 30 || parsed === 90) return parsed
  return fallback
}

export function resolveCappedDateRange(fromRaw: string | null | undefined, toRaw: string | null | undefined, fallbackDays = 30) {
  const now = new Date()
  const fallbackFrom = new Date(now)
  fallbackFrom.setDate(fallbackFrom.getDate() - fallbackDays)

  const to = toRaw ? new Date(toRaw) : now
  const from = fromRaw ? new Date(fromRaw) : fallbackFrom

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return { from: fallbackFrom, to: now, capped: false }
  }

  const normalizedFrom = new Date(from)
  normalizedFrom.setHours(0, 0, 0, 0)
  const normalizedTo = new Date(to)
  normalizedTo.setHours(23, 59, 59, 999)

  const maxRangeStart = new Date(normalizedTo)
  maxRangeStart.setDate(maxRangeStart.getDate() - 90)

  if (normalizedFrom < maxRangeStart) {
    return { from: maxRangeStart, to: normalizedTo, capped: true }
  }

  if (normalizedFrom > normalizedTo) {
    const repairedFrom = new Date(normalizedTo)
    repairedFrom.setDate(repairedFrom.getDate() - fallbackDays)
    repairedFrom.setHours(0, 0, 0, 0)
    return { from: repairedFrom, to: normalizedTo, capped: true }
  }

  return { from: normalizedFrom, to: normalizedTo, capped: false }
}

export function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value).replace(/"/g, '""')
  return /[,"\n\r]/.test(s) ? `"${s}"` : s
}

export function formatTrend(current: number, previous: number): { delta: number; direction: 'up' | 'down' | 'flat' } {
  if (previous <= 0 && current <= 0) return { delta: 0, direction: 'flat' }
  if (previous <= 0) return { delta: 100, direction: 'up' }
  const delta = ((current - previous) / previous) * 100
  if (Math.abs(delta) < 0.5) return { delta: 0, direction: 'flat' }
  return { delta: Math.round(delta * 10) / 10, direction: delta > 0 ? 'up' : 'down' }
}
