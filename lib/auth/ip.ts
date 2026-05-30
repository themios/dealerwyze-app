/**
 * Extract client IP address from request headers.
 * Used for audit logging and rate limiting.
 */

import { NextRequest } from 'next/server'

export function getClientIP(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null
  }

  const realIP = req.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }

  return null
}
