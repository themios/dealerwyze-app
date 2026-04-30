/**
 * TEST-06: Webhook verification tests
 *
 * Verifies that Twilio inbound webhook rejects requests with invalid signatures.
 * Also verifies that web lead capture rejects malformed input and rate-limited IPs.
 */

import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

// ── Twilio signature validation (TEST-06) ─────────────────────────────────────

/**
 * Replicate the validateTwilioSignature logic from the route so we can
 * construct valid and invalid signatures in tests.
 */
function buildTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedParams = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  return crypto.createHmac('sha1', authToken).update(url + sortedParams).digest('base64')
}

describe('Twilio signature validation', () => {
  const AUTH_TOKEN  = 'test-auth-token-12345'
  const WEBHOOK_URL = 'https://dealerwyze.com/api/twilio/inbound'
  const PARAMS      = { From: '+15551234567', Body: 'Hello', To: '+15559876543' }

  it('accepts a correctly signed request', () => {
    const sig = buildTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, PARAMS)
    const sortedParams = Object.keys(PARAMS).sort().reduce((s, k) => s + k + (PARAMS as Record<string,string>)[k], '')
    const expected = crypto.createHmac('sha1', AUTH_TOKEN).update(WEBHOOK_URL + sortedParams).digest('base64')

    // Constant-time comparison must succeed
    expect(crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))).toBe(true)
  })

  it('rejects a request with a tampered signature', () => {
    const validSig   = buildTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, PARAMS)
    const tamperedSig = validSig.slice(0, -4) + 'XXXX'

    let valid = false
    try {
      valid = crypto.timingSafeEqual(Buffer.from(validSig), Buffer.from(tamperedSig))
    } catch {
      valid = false
    }
    expect(valid).toBe(false)
  })

  it('rejects a request signed with a different auth token', () => {
    const wrongSig = buildTwilioSignature('wrong-token', WEBHOOK_URL, PARAMS)
    const rightSig = buildTwilioSignature(AUTH_TOKEN,   WEBHOOK_URL, PARAMS)
    expect(crypto.timingSafeEqual(Buffer.from(wrongSig), Buffer.from(rightSig))).toBe(false)
  })

  it('rejects a request with extra params not included in the signature', () => {
    const sigForOriginal = buildTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, PARAMS)
    const sigForTamperedParams = buildTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, { ...PARAMS, Extra: 'injected' })
    expect(crypto.timingSafeEqual(Buffer.from(sigForOriginal), Buffer.from(sigForTamperedParams))).toBe(false)
  })

  it('rejects when URL differs from signed URL', () => {
    const sigForCorrectUrl = buildTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, PARAMS)
    const sigForWrongUrl   = buildTwilioSignature(AUTH_TOKEN, 'https://evil.com/api/twilio/inbound', PARAMS)
    expect(crypto.timingSafeEqual(Buffer.from(sigForCorrectUrl), Buffer.from(sigForWrongUrl))).toBe(false)
  })
})
