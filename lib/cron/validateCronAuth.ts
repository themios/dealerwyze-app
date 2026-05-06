import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit/log'

/**
 * Validates cron route authentication using timing-safe comparison.
 *
 * Accepts two auth methods:
 *   1. Authorization: Bearer <CRON_SECRET>  (current standard)
 *   2. x-cron-secret: <LEADS_POLL_SECRET>   (legacy fallback — some older cron-job.org entries)
 *
 * Returns a 401 NextResponse if auth fails, or null if auth passes.
 * Usage:
 *   const denied = validateCronAuth(req)
 *   if (denied) return denied
 */
export function validateCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET ?? ''
  const legacySecret = process.env.LEADS_POLL_SECRET ?? ''

  const bearerHeader = req.headers.get('authorization') ?? ''
  const legacyHeader = req.headers.get('x-cron-secret') ?? ''

  const expected = `Bearer ${cronSecret}`

  // Use timingSafeEqual to prevent timing attacks on secret comparison.
  // Buffers must be the same length for timingSafeEqual — pad/truncate as needed.
  function safeCompare(a: string, b: string): boolean {
    if (!a || !b) return false
    try {
      const bufA = Buffer.from(a)
      const bufB = Buffer.from(b)
      if (bufA.length !== bufB.length) return false
      return crypto.timingSafeEqual(bufA, bufB)
    } catch {
      return false
    }
  }

  const bearerOk = safeCompare(bearerHeader, expected)
  const legacyOk = legacySecret.length > 0 && safeCompare(legacyHeader, legacySecret)

  if (!bearerOk && !legacyOk) {
    const path =
      'nextUrl' in req && req.nextUrl && typeof req.nextUrl.pathname === 'string'
        ? req.nextUrl.pathname
        : '/cron'
    void writeAuditLog({
      orgId:     null,
      actorId:   null,
      actorType: 'user',
      action:    'webhook_auth_failure',
      metadata:  { path, reason: 'invalid_cron_secret' },
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
