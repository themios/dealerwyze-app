import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { type ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.STAFF_SESSION_SECRET
if (!SECRET) throw new Error('STAFF_SESSION_SECRET env var is required — set it in Vercel and .env.local')
// TypeScript narrowing: SECRET is a non-empty string from here down
const _SECRET: string = SECRET
const COOKIE_NAME       = 'dealerwyze_staff_org_id'
const TTL_READ_SECONDS  = 2 * 60 * 60  // 2 hours  — read-only view
const TTL_WRITE_SECONDS = 30 * 60       // 30 minutes — Remote Admin (write-enabled)

function sign(value: string): string {
  const mac = createHmac('sha256', _SECRET).update(value).digest('hex')
  return `${value}.${mac}`
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null
  const value = signed.slice(0, lastDot)
  const mac = signed.slice(lastDot + 1)
  const expected = createHmac('sha256', _SECRET).update(value).digest('hex')
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

export interface StaffSession {
  orgId:     string
  writeMode: boolean  // true = Remote Admin (write-enabled), false = read-only view
}

/**
 * Parse the staff session cookie.
 * Payload format: `<orgId>|<writeMode:0|1>` (HMAC-signed).
 * Backward-compat: legacy cookies without `|` are treated as read-only.
 */
export function getStaffSessionInfo(cookies: ReadonlyRequestCookies): StaffSession | null {
  const raw = cookies.get(COOKIE_NAME)?.value
  if (!raw) return null
  const payload = verify(raw)
  if (!payload) return null
  const pipeIdx = payload.lastIndexOf('|')
  if (pipeIdx === -1) return { orgId: payload, writeMode: false }  // legacy cookie
  return {
    orgId:     payload.slice(0, pipeIdx),
    writeMode: payload.slice(pipeIdx + 1) === '1',
  }
}

/** @deprecated Use getStaffSessionInfo — kept for call sites that only need orgId */
export function getStaffOrgOverride(cookies: ReadonlyRequestCookies): string | null {
  return getStaffSessionInfo(cookies)?.orgId ?? null
}

/** Build the cookie options to SET the staff session.
 *  Read-only: 2hr TTL. Write-mode (Remote Admin): 30min TTL.
 */
export function buildStaffOrgCookie(orgId: string, writeMode = false): Partial<ResponseCookie> & { name: string; value: string } {
  return {
    name: COOKIE_NAME,
    value: sign(`${orgId}|${writeMode ? '1' : '0'}`),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: writeMode ? TTL_WRITE_SECONDS : TTL_READ_SECONDS,
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
