import { createHmac, timingSafeEqual } from 'crypto'

const TTL_MS = 24 * 60 * 60 * 1000

function requireSecret(): string {
  const s = process.env.BHPH_ACH_SECRET
  if (!s || s.length < 16) {
    throw new Error('BHPH_ACH_SECRET must be set (min 16 chars)')
  }
  return s
}

/**
 * Signed setup token: base64url(payload).base64url(hmac)
 * payload = `${contractId}:${expiresAtUnixMs}`
 */
export function generateAchSetupToken(contractId: string): string {
  const secret = requireSecret()
  const expiresAt = Date.now() + TTL_MS
  const payload = `${contractId}:${expiresAt}`
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyAchSetupToken(token: string): { contractId: string } | null {
  let secret: string
  try {
    secret = requireSecret()
  } catch {
    return null
  }

  const dot = token.indexOf('.')
  if (dot === -1) return null
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payloadB64 || !sig) return null

  const expected = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  let payload: string
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const colon = payload.indexOf(':')
  if (colon === -1) return null
  const contractId = payload.slice(0, colon)
  const expStr = payload.slice(colon + 1)
  const exp = Number(expStr)
  if (!contractId || !Number.isFinite(exp) || exp < Date.now()) return null

  return { contractId }
}

export function maskContractId(contractId: string): string {
  if (contractId.length <= 8) return '…'
  return `${contractId.slice(0, 8)}…`
}
