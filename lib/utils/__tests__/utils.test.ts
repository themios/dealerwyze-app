import { describe, it, expect } from 'vitest'
import {
  shouldShowAddressedActivity,
  leadIsStale,
  leadAgeBadge,
} from '@/lib/utils'

// Fixed reference point for all tests: 2026-01-15 noon UTC
const TODAY = new Date('2026-01-15T12:00:00Z')
const YESTERDAY = new Date('2026-01-14T12:00:00Z')
const TWO_DAYS_AGO = new Date('2026-01-13T12:00:00Z')
const TOMORROW = new Date('2026-01-16T12:00:00Z')

function iso(d: Date): string {
  return d.toISOString()
}

describe('shouldShowAddressedActivity', () => {
  it('returns true when no addressed_at (never addressed)', () => {
    expect(
      shouldShowAddressedActivity({ addressed_at: null, due_at: null }, TODAY)
    ).toBe(true)
  })

  it('returns false when addressed today', () => {
    expect(
      shouldShowAddressedActivity({ addressed_at: iso(TODAY), due_at: null }, TODAY)
    ).toBe(false)
  })

  it('returns true when addressed yesterday with no due_at', () => {
    expect(
      shouldShowAddressedActivity({ addressed_at: iso(YESTERDAY), due_at: null }, TODAY)
    ).toBe(true)
  })

  it('returns false when addressed yesterday and due_at is tomorrow (still snoozed)', () => {
    expect(
      shouldShowAddressedActivity(
        { addressed_at: iso(YESTERDAY), due_at: iso(TOMORROW) },
        TODAY
      )
    ).toBe(false)
  })

  it('returns true when addressed two days ago and due_at was yesterday (snooze expired)', () => {
    expect(
      shouldShowAddressedActivity(
        { addressed_at: iso(TWO_DAYS_AGO), due_at: iso(YESTERDAY) },
        TODAY
      )
    ).toBe(true)
  })
})

describe('leadIsStale', () => {
  it('returns false for a lead created today', () => {
    expect(leadIsStale(new Date().toISOString())).toBe(false)
  })

  it('returns false for a lead 14 days old', () => {
    const d = new Date(Date.now() - 14 * 86_400_000).toISOString()
    expect(leadIsStale(d)).toBe(false)
  })

  it('returns true for a lead 15 days old', () => {
    const d = new Date(Date.now() - 15 * 86_400_000).toISOString()
    expect(leadIsStale(d)).toBe(true)
  })

  it('returns true for a lead 30 days old', () => {
    const d = new Date(Date.now() - 30 * 86_400_000).toISOString()
    expect(leadIsStale(d)).toBe(true)
  })
})

describe('leadAgeBadge', () => {
  it('returns Today for same-day lead', () => {
    const badge = leadAgeBadge(new Date().toISOString())
    expect(badge.label).toBe('Today')
  })

  it('returns 1d old for a 1-day-old lead', () => {
    const d = new Date(Date.now() - 86_400_000).toISOString()
    const badge = leadAgeBadge(d)
    expect(badge.label).toBe('1d old')
  })

  it('returns red class for an 8-day-old lead', () => {
    const d = new Date(Date.now() - 8 * 86_400_000).toISOString()
    const badge = leadAgeBadge(d)
    expect(badge.cls).toContain('red')
  })

  it('returns amber class for a 2-day-old lead', () => {
    const d = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const badge = leadAgeBadge(d)
    expect(badge.cls).toContain('amber')
  })

  it('returns month label for a 35-day-old lead', () => {
    const d = new Date(Date.now() - 35 * 86_400_000).toISOString()
    const badge = leadAgeBadge(d)
    expect(badge.label).toBe('1mo old')
  })
})
