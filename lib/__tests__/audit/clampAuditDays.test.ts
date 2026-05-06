import { describe, it, expect } from 'vitest'
import { clampAuditDaysParam, DEFAULT_AUDIT_DAYS, MAX_AUDIT_DAYS } from '@/lib/audit/clampAuditDays'

describe('clampAuditDaysParam', () => {
  it('clamps values above max to 90', () => {
    expect(clampAuditDaysParam(999)).toBe(MAX_AUDIT_DAYS)
    expect(clampAuditDaysParam(200)).toBe(MAX_AUDIT_DAYS)
  })

  it('uses fallback for invalid input', () => {
    expect(clampAuditDaysParam(NaN)).toBe(DEFAULT_AUDIT_DAYS)
    expect(clampAuditDaysParam(0)).toBe(DEFAULT_AUDIT_DAYS)
    expect(clampAuditDaysParam(-5)).toBe(DEFAULT_AUDIT_DAYS)
  })

  it('preserves valid range 1–90', () => {
    expect(clampAuditDaysParam(7)).toBe(7)
    expect(clampAuditDaysParam(45)).toBe(45)
    expect(clampAuditDaysParam(90)).toBe(90)
  })
})
