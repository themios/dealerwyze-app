import type { NextRequest } from 'next/server'

/** Best-effort client IP for audit logs (behind Vercel/proxies). */
export function requestClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? null
  return req.headers.get('x-real-ip')
}
