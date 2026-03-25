import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Rate limiting (formerly middleware.ts) ────────────────────────────────────
// In-process sliding window — good enough for <10 dealers on Vercel.

interface RateEntry { count: number; resetAt: number }
const store = new Map<string, RateEntry>()

const RATE_ROUTES: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: '/api/twilio/inbound',          limit: 60,  windowMs:  60_000 },
  { prefix: '/api/voice/retell-callback',   limit: 30,  windowMs:  60_000 },
  { prefix: '/api/gmail/webhook',           limit: 60,  windowMs:  60_000 },
  // Inventory feed endpoints deprecated 2026-03-04; now return 410 Gone (no rate limit needed)
  // Vector 5: tighter per-IP limit on data-heavy read endpoints
  { prefix: '/api/customers',               limit: 100, windowMs:  60_000 }, // 100/min max per IP
  { prefix: '/api/vehicles',                limit: 100, windowMs:  60_000 },
  // Vector 12: brute-force / credential stuffing protection
  { prefix: '/api/auth/login',              limit:   8, windowMs: 300_000 }, // 8 attempts / 5 min per IP
  { prefix: '/api/auth/register',           limit:   3, windowMs: 600_000 }, // 3 signups / 10 min per IP
]

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function isRateLimited(ip: string, prefix: string, limit: number, windowMs: number): boolean {
  const key   = `${ip}:${prefix}`
  const now   = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count++
  return entry.count > limit
}

let lastPruned = Date.now()
function maybePrune() {
  const now = Date.now()
  if (now - lastPruned < 60_000) return
  lastPruned = now
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}

// ── Staff impersonation: block mutations (read-only mode only) ────────────────

import { createHmac, timingSafeEqual } from 'crypto'

const IMPERSONATION_COOKIE = 'dealerwyze_staff_org_id'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Routes allowed to mutate regardless of impersonation mode (end session + auth)
const IMPERSONATION_ALLOWED_PREFIXES = ['/api/admin/impersonate', '/api/auth/']

const _SECRET = process.env.STAFF_SESSION_SECRET ?? ''

function _verifyStaffCookie(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null
  const value = signed.slice(0, lastDot)
  const mac   = signed.slice(lastDot + 1)
  const expected = createHmac('sha256', _SECRET).update(value).digest('hex')
  try {
    const a = Buffer.from(mac,      'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return null
    return timingSafeEqual(a, b) ? value : null
  } catch { return null }
}

function isImpersonationBlocked(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false
  const raw = request.cookies.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return false
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/api/')) return false
  if (IMPERSONATION_ALLOWED_PREFIXES.some(p => pathname.startsWith(p))) return false

  // Decode cookie to check write mode
  const payload = _verifyStaffCookie(raw)
  if (!payload) return false  // invalid cookie — don't block (will fail auth downstream)

  // payload format: `orgId|1` (write) or `orgId|0` / `orgId` (read-only)
  const pipeIdx = payload.lastIndexOf('|')
  const writeMode = pipeIdx !== -1 && payload.slice(pipeIdx + 1) === '1'

  // Block mutations only in read-only mode
  return !writeMode
}

// ── Auth + subscription gating (original proxy.ts) ───────────────────────────

const PUBLIC_PATHS    = ['/', '/login', '/signup', '/privacy', '/terms', '/privacy.html', '/terms.html', '/forgot-password', '/reset-password']
const PUBLIC_PREFIXES = ['/auth/', '/api/auth/', '/api/stripe/webhook', '/_next/', '/blog', '/robots.txt', '/sitemap.xml']
const PUBLIC_FILES    = ['/favicon.ico', '/logo.jpg', '/manifest.json']
const BILLING_EXEMPT  = ['/settings/billing', '/settings/users', '/pending', '/suspended', '/onboarding']

// Public dealer inventory pages: /{slug}/inventory[/*] and /{slug}/sitemap.xml
// Segments[1] must be 'inventory' to avoid colliding with any existing app routes.
// All known CRM first-segments (today, vehicles, customers, settings, etc.) never
// use 'inventory' as their second segment, so this pattern is safe.
function isDealerPublicPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 2) return false
  return segments[1] === 'inventory' || /^\/[^/]+\/sitemap\.xml$/.test(pathname)
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (PUBLIC_FILES.includes(pathname)) return true
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true
  if (isDealerPublicPath(pathname)) return true
  return false
}

function isAppRoute(pathname: string): boolean {
  return (
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/') &&
    !PUBLIC_PATHS.includes(pathname) &&
    !PUBLIC_FILES.includes(pathname) &&
    !pathname.startsWith('/auth/')
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Block mutating API calls during staff impersonation sessions
  if (isImpersonationBlocked(request)) {
    return new NextResponse('Forbidden: read-only during staff impersonation', { status: 403 })
  }

  // Rate limiting for public webhook/feed routes
  const rateRule = RATE_ROUTES.find(r => pathname.startsWith(r.prefix))
  if (rateRule) {
    maybePrune()
    if (isRateLimited(getIp(request), rateRule.prefix, rateRule.limit, rateRule.windowMs)) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rateRule.windowMs / 1000)) },
      })
    }
    return NextResponse.next()
  }

  // Pass through all other API routes without auth check
  if (pathname.startsWith('/api/')) return NextResponse.next()

  // Pass through public paths immediately
  if (isPublic(pathname)) {
    return NextResponse.next({ request })
  }

  // Inject pathname as header so server layouts can read it via headers()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login
  if (pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/today'
    return NextResponse.redirect(url)
  }

  // Subscription gating for app routes
  if (isAppRoute(pathname)) {
    if (BILLING_EXEMPT.some(p => pathname.startsWith(p))) {
      return supabaseResponse
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (profile?.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('subscription_status, trial_ends_at, suspended_at')
        .eq('id', profile.org_id)
        .maybeSingle()

      if (org) {
        const { subscription_status, trial_ends_at, suspended_at } = org as typeof org & { suspended_at?: string | null }
        const trialExpired =
          subscription_status === 'trialing' &&
          trial_ends_at &&
          new Date(trial_ends_at) < new Date()

        // Suspended accounts — redirect to suspension page (except the page itself)
        if (suspended_at && !pathname.startsWith('/suspended')) {
          const url = request.nextUrl.clone()
          url.pathname = '/suspended'
          return NextResponse.redirect(url)
        }

        if (subscription_status === 'canceled' || trialExpired) {
          const url = request.nextUrl.clone()
          url.pathname = '/settings/billing'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Rate-limited API routes
    '/api/twilio/inbound',
    '/api/voice/retell-callback',
    '/api/inventory/cargurus-feed',
    '/api/inventory/facebook-feed',
    // Auth + subscription gating for all app routes
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
}
