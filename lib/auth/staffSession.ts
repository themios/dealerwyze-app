import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { type ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'staff-session-secret'
const COOKIE_NAME = 'dealerwyze_staff_org_id'
const TTL_SECONDS = 2 * 60 * 60 // 2 hours

function sign(value: string): string {
  const mac = createHmac('sha256', SECRET).update(value).digest('hex')
  return `${value}.${mac}`
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null
  const value = signed.slice(0, lastDot)
  const mac = signed.slice(lastDot + 1)
  const expected = createHmac('sha256', SECRET).update(value).digest('hex')
  try {
    const macBuf = Buffer.from(mac, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (macBuf.length !== expBuf.length) return null
    if (!timingSafeEqual(macBuf, expBuf)) return null
    return value
  } catch {
    return null
  }
}

/** Read the staff org override from cookies. Returns null if not set / invalid. */
export function getStaffOrgOverride(cookies: ReadonlyRequestCookies): string | null {
  const raw = cookies.get(COOKIE_NAME)?.value
  if (!raw) return null
  return verify(raw)
}

/** Build the cookie options to SET the staff org override (2hr TTL, httpOnly, SameSite=Lax) */
export function buildStaffOrgCookie(orgId: string): Partial<ResponseCookie> & { name: string; value: string } {
  return {
    name: COOKIE_NAME,
    value: sign(orgId),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_SECONDS,
    path: '/',
  }
}

/** Build the cookie options to CLEAR the staff org override */
export function clearStaffOrgCookie(): Partial<ResponseCookie> & { name: string; value: string } {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  }
}
