import { createHmac } from 'crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateAchSetupToken,
  verifyAchSetupToken,
} from '@/lib/bhph/achSetupToken'

const SECRET = 'test-bhph-ach-secret-16chars-min'

describe('achSetupToken', () => {
  beforeEach(() => {
    process.env.BHPH_ACH_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.BHPH_ACH_SECRET
  })

  it('round-trips a valid token', () => {
    const contractId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const token = generateAchSetupToken(contractId)
    const out = verifyAchSetupToken(token)
    expect(out).toEqual({ contractId })
  })

  it('returns null for an expired token', () => {
    const contractId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const token = generateAchSetupToken(contractId)
    const parsed = token.split('.')
    expect(parsed.length).toBe(2)
    const payload = Buffer.from(parsed[0]!, 'base64url').toString('utf8')
    const colon = payload.indexOf(':')
    const forgedPayload = `${payload.slice(0, colon)}:${Date.now() - 60_000}`
    const forgedB64 = Buffer.from(forgedPayload, 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(forgedB64).digest('base64url')
    const expiredToken = `${forgedB64}.${sig}`
    expect(verifyAchSetupToken(expiredToken)).toBeNull()
  })

  it('returns null for a tampered token', () => {
    const token = generateAchSetupToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const [payloadB64, sig] = token.split('.')
    expect(payloadB64 && sig).toBeTruthy()
    const tampered = `${payloadB64}dead.${sig}`
    expect(verifyAchSetupToken(tampered)).toBeNull()
  })

  it('returns null when secret is missing', () => {
    delete process.env.BHPH_ACH_SECRET
    expect(verifyAchSetupToken('anything')).toBeNull()
  })
})
