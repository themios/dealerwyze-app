import { describe, expect, it } from 'vitest'
import { sanitizeCtaUrl, sanitizeWebsiteSocial } from '@/lib/dealer-public/personalization'

describe('sanitizeWebsiteSocial (https-only)', () => {
  it('upgrades http social URLs to https', () => {
    const out = sanitizeWebsiteSocial({
      facebook: 'http://facebook.com/dealer',
    })
    expect(out.facebook).toBe('https://facebook.com/dealer')
  })

  it('rejects non-http(s) schemes', () => {
    const out = sanitizeWebsiteSocial({
      instagram: 'javascript:alert(1)',
    })
    expect(out.instagram).toBeUndefined()
  })
})

describe('sanitizeCtaUrl (https-only for absolute URLs)', () => {
  it('preserves root-relative paths', () => {
    expect(sanitizeCtaUrl('/apply')).toBe('/apply')
  })

  it('upgrades http absolute URLs to https', () => {
    expect(sanitizeCtaUrl('http://example.com/form')).toBe('https://example.com/form')
  })

  it('keeps https URLs', () => {
    expect(sanitizeCtaUrl('https://example.com/form')).toBe('https://example.com/form')
  })
})
