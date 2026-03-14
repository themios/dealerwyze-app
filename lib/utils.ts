import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

export function formatPhoneForTel(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : `+${digits}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(date)
}

export function tomorrow8am(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d
}

export function tomorrow9am(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

export function in2hours(): Date {
  return new Date(Date.now() + 2 * 60 * 60 * 1000)
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => key in vars ? vars[key] : match)
}

/** Prefix activity/note body with author so entries show who wrote them. */
export function prefixWithAuthorName(displayName: string | null | undefined, body: string): string {
  const name = displayName?.trim()
  if (!name) return body
  return `name: ${name}\n${body}`
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** Returns true if a lead has been sitting unworked for 15+ days */
export function leadIsStale(createdAt: string): boolean {
  return daysSince(createdAt) >= 15
}

/** Color-coded badge for lead age (how long since created_at) */
export function leadAgeBadge(createdAt: string): { label: string; cls: string } {
  const d = daysSince(createdAt)
  if (d < 1)  return { label: 'Today',        cls: 'bg-green-100 text-green-700' }
  if (d === 1) return { label: '1d old',       cls: 'bg-green-100 text-green-700' }
  if (d <= 3)  return { label: `${d}d old`,    cls: 'bg-amber-100 text-amber-700' }
  if (d <= 7)  return { label: `${d}d old`,    cls: 'bg-orange-100 text-orange-700' }
  if (d <= 30) return { label: `${Math.floor(d / 7)}w old`, cls: 'bg-red-100 text-red-700' }
  return { label: `${Math.floor(d / 30)}mo old`, cls: 'bg-red-200 text-red-800' }
}

/** Color-coded badge for last contact (null = never contacted) */
export function lastContactBadge(lastAt: string | null): { label: string; cls: string } {
  if (!lastAt) return { label: 'No contact', cls: 'bg-red-100 text-red-700' }
  const d = daysSince(lastAt)
  if (d < 1)  return { label: 'Today',          cls: 'bg-green-100 text-green-700' }
  if (d === 1) return { label: '1d ago',         cls: 'bg-green-100 text-green-700' }
  if (d <= 3)  return { label: `${d}d ago`,      cls: 'bg-amber-100 text-amber-700' }
  if (d <= 7)  return { label: `${d}d ago`,      cls: 'bg-orange-100 text-orange-700' }
  if (d <= 30) return { label: `${Math.floor(d / 7)}w ago`, cls: 'bg-red-100 text-red-700' }
  return { label: `${Math.floor(d / 30)}mo ago`, cls: 'bg-red-200 text-red-800' }
}

/** Date-only (start of day) for comparison */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Whether an activity that was "addressed" (user opened customer from Today) should
 * show again on the given date. Addressed cards hide until the next calendar day or
 * the activity's follow-up due date, whichever applies.
 */
export function shouldShowAddressedActivity(
  activity: { addressed_at?: string | null; due_at?: string | null },
  asOf: Date = new Date()
): boolean {
  if (!activity.addressed_at) return true
  const addressedDate = toDateKey(new Date(activity.addressed_at))
  const today = toDateKey(asOf)
  if (today === addressedDate) return false
  if (today > addressedDate) {
    const dueDate = activity.due_at ? toDateKey(new Date(activity.due_at)) : null
    if (dueDate && dueDate > addressedDate && today < dueDate) return false
    return true
  }
  if (activity.due_at) {
    const dueDate = toDateKey(new Date(activity.due_at))
    if (today >= dueDate) return true
  }
  return false
}
