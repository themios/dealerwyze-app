import { describe, it, expect } from 'vitest'
import { validateWebhookSignature } from '@/lib/mls/bridgeClient'

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(payload)
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, data)
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('bridgeClient webhook signature validation', () => {
  it('accepts a valid raw hex signature', async () => {
    const payload = JSON.stringify({ event: 'listing.updated', mls_number: 'ABC123' })
    const secret = 'bridge-test-secret'
    const signature = await hmacSha256Hex(payload, secret)

    const valid = await validateWebhookSignature(payload, signature, secret)
    expect(valid).toBe(true)
  })

  it('accepts a valid sha256= signature prefix', async () => {
    const payload = JSON.stringify({ event: 'listing.updated', mls_number: 'ABC123' })
    const secret = 'bridge-test-secret'
    const signature = await hmacSha256Hex(payload, secret)

    const valid = await validateWebhookSignature(payload, `sha256=${signature}`, secret)
    expect(valid).toBe(true)
  })

  it('rejects tampered payload with original signature', async () => {
    const originalPayload = JSON.stringify({ event: 'listing.updated', mls_number: 'ABC123' })
    const tamperedPayload = JSON.stringify({ event: 'listing.updated', mls_number: 'XYZ999' })
    const secret = 'bridge-test-secret'
    const signature = await hmacSha256Hex(originalPayload, secret)

    const valid = await validateWebhookSignature(tamperedPayload, signature, secret)
    expect(valid).toBe(false)
  })
})
