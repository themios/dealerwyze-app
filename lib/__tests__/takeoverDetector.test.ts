import { describe, expect, it } from 'vitest'

import { detectTakeoverSignal } from '@/lib/today/takeoverDetector'

describe('detectTakeoverSignal', () => {
  it('detects financing language', () => {
    expect(detectTakeoverSignal('How much down payment would I need?')?.trigger).toBe('financing')
  })

  it('detects appointment language', () => {
    expect(detectTakeoverSignal('When are you open tomorrow for a test drive?')?.trigger).toBe('appointment')
  })

  it('detects same-day arrival language', () => {
    expect(detectTakeoverSignal('I am on my way and coming today.')?.trigger).toBe('coming_today')
  })

  it('detects strong buying intent', () => {
    expect(detectTakeoverSignal("I'll take it if the numbers work.")?.trigger).toBe('strong_intent')
  })

  it('detects objection language', () => {
    expect(detectTakeoverSignal('I like it but my wife is not sure yet.')?.trigger).toBe('objection')
  })

  it('returns null for neutral replies', () => {
    expect(detectTakeoverSignal('Ok thanks, sounds good.')).toBeNull()
  })
})
