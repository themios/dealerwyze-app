import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { i18n } from '@/i18n.config'

// ── POLICY 1: Rate Limiting ────────────────────────────────────────────────────
// Upstash Redis sliding window per IP — shared across all Vercel instances.
// Falls back to allowing all requests when UPSTASH_REDIS_REST_URL / _TOKEN are unset
// so local dev works without an Upstash account.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

const _rlUrl   = process.env.UPSTASH_REDIS_REST_URL
const _rlToken = process.env.UPSTASH_REDIS_REST_TOKEN
const _redis   = _rlUrl && _rlToken ? new Redis({ url: _rlUrl, token: _rlToken }) : null

function makeLimiter(requests: number, windowSeconds: number): Ratelimit | null {
  if (!_redis) return null
  return new Ratelimit({
    redis: _redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    analytics: false,
  })
}

const RATE_ROUTES: Array<{ prefix: string; limiter: Ratelimit | null; retryAfter: number }> = [
  { prefix: '/api/twilio/inbound',          limiter: makeLimiter(60,  60),  retryAfter: 60  },
  { prefix: '/api/voice/retell-callback',   limiter: makeLimiter(30,  60),  retryAfter: 60  },
  { prefix: '/api/gmail/webhook',           limiter: makeLimiter(60,  60),  retryAfter: 60  },
  // Data endpoints — secondary layer; routes also have per-org Upstash guards in handlers
  { prefix: '/api/customers',               limiter: makeLimiter(100, 60),  retryAfter: 60  },
  { prefix: '/api/vehicles',               limiter: makeLimiter(100, 60),  retryAfter: 60  },
  // Brute-force / credential stuffing protection
  { prefix: '/api/auth/login',              limiter: makeLimiter(8,   300), retryAfter: 300 },
  { prefix: '/api/auth/register',           limiter: makeLimiter(3,   600), retryAfter: 600 },
]

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

async function isRateLimited(limiter: Ratelimit | null, key: string): Promise<boolean> {
  if (!limiter) return false
  const result = await limiter.limit(key)
  return !result.success
}

// ── POLICY 2: Staff Impersonation Guard ───────────────────────────────────────
// Reads HMAC-signed cookie. Blocks all state-mutating methods (POST/PUT/PATCH/DELETE)
// when the session is read-only (writeMode=0). Write-mode sessions (writeMode=1) pass through.
// Cookie: dealerwyze_staff_org_id | Secret: STAFF_SESSION_SECRET

// Edge Runtime compatible: use Web Crypto API instead of Node.js 'crypto'
const _enc = new TextEncoder()

// Constant-time byte comparison (Web Crypto has no timingSafeEqual)
function edgeTimingSafeEqual(a: string, b: string): boolean {
  const ab = _enc.encode(a)
  const bb = _enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// HMAC-SHA256 hex digest via Web Crypto
async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw', _enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, _enc.encode(value))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const IMPERSONATION_COOKIE = 'dealerwyze_staff_org_id'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Routes allowed to mutate regardless of impersonation mode (end session + auth)
const IMPERSONATION_ALLOWED_PREFIXES = ['/api/admin/impersonate', '/api/auth/']

const _SECRET = process.env.STAFF_SESSION_SECRET ?? ''

async function _verifyStaffCookie(signed: string): Promise<string | null> {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null
  const value    = signed.slice(0, lastDot)
  const mac      = signed.slice(lastDot + 1)
  const expected = await hmacHex(_SECRET, value)
  return edgeTimingSafeEqual(mac, expected) ? value : null
}

async function isImpersonationBlocked(request: NextRequest): Promise<boolean> {
  if (!MUTATING_METHODS.has(request.method)) return false
  const raw = request.cookies.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return false
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/api/')) return false
  if (IMPERSONATION_ALLOWED_PREFIXES.some(p => pathname.startsWith(p))) return false

  // Decode cookie to check write mode
  const payload = await _verifyStaffCookie(raw)
  if (!payload) return false  // invalid cookie — don't block (will fail auth downstream)

  // payload format: `orgId|1` (write) or `orgId|0` / `orgId` (read-only)
  const pipeIdx = payload.lastIndexOf('|')
  const writeMode = pipeIdx !== -1 && payload.slice(pipeIdx + 1) === '1'

  // Block mutations only in read-only mode
  return !writeMode
}

// ── POLICY 3: Public Path Detection ──────────────────────────────────────────
// Determines whether a path needs auth. Extend PUBLIC_PATHS / PUBLIC_PREFIXES as needed.
// isDealerPublicPath() matches /{slug}/inventory/* — safe because no app route uses 'inventory' as segment[1].

const PUBLIC_PATHS    = ['/', '/login', '/signup', '/privacy', '/terms', '/privacy.html', '/terms.html', '/forgot-password', '/reset-password', '/sms-opt-in']
const PUBLIC_PREFIXES = ['/auth/', '/api/auth/', '/api/stripe/webhook', '/_next/', '/blog', '/lp', '/robots.txt', '/sitemap.xml']
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

// ── Vertical Detection ────────────────────────────────────────────────────────
// Determines which product brand is active based on the request hostname.
// 'dealer' is the default — all existing DealerWyze orgs are unaffected.
const REALTY_HOSTS = ['realtywyze.us', 'www.realtywyze.us', 'realtywyze.localhost']

export function resolveVertical(host: string): 'dealer' | 'real_estate' {
  return REALTY_HOSTS.some(h => host.includes(h)) ? 'real_estate' : 'dealer'
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

function isTrialExpired(subscriptionStatus: string, trialEndsAt: string | null): boolean {
  return subscriptionStatus === 'trialing' && !!trialEndsAt && new Date(trialEndsAt) < new Date()
}

function isSuspended(suspendedAt: string | null | undefined): boolean {
  return !!suspendedAt
}

// next-intl middleware for i18n routing (/en/, /es/, etc.)
const intlMiddleware = createMiddleware({
  locales: i18n.locales,
  defaultLocale: i18n.defaultLocale,
  localePrefix: 'as-needed',
})

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const vertical = resolveVertical(request.headers.get('host') ?? '')

  // Apply next-intl middleware for language routing
  // This must run before auth checks so paths are correctly routed to /{locale}/...
  const intlResponse = intlMiddleware(request)
  if (intlResponse) {
    return intlResponse
  }

  // Block mutating API calls during staff impersonation sessions
  if (await isImpersonationBlocked(request)) {
    return new NextResponse('Forbidden: read-only during staff impersonation', { status: 403 })
  }

  // Rate limiting for public webhook/feed routes
  const rateRule = RATE_ROUTES.find(r => pathname.startsWith(r.prefix))
  if (rateRule) {
    if (await isRateLimited(rateRule.limiter, `${getIp(request)}:${rateRule.prefix}`)) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(rateRule.retryAfter) },
      })
    }
    return NextResponse.next()
  }

  // ── POLICY 4: CSRF Protection ──────────────────────────────────────────────────
  // For state-mutating requests to /api/*, verify Origin header matches request host.
  // Webhook prefixes (stripe, twilio, retell, etc.) are excluded — they use signature verification.
  if (pathname.startsWith('/api/') && MUTATING_METHODS.has(request.method)) {
    const csrfExemptPrefixes = ['/api/stripe/webhook', '/api/twilio/inbound', '/api/voice/retell-callback', '/api/fax/webhook', '/api/telegram/webhook']
    const isExempt = csrfExemptPrefixes.some(p => pathname.startsWith(p))

    if (!isExempt) {
      const origin = request.headers.get('origin') || request.headers.get('referer')?.split('?')[0]
      const host = request.headers.get('host')
      const secFetchSite = request.headers.get('sec-fetch-site')

      // Reject if Origin/Referer does not match host, or Sec-Fetch-Site indicates cross-site
      if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site') {
        return new NextResponse('Forbidden: cross-origin request', { status: 403 })
      }
      if (origin && host && !origin.includes(host)) {
        return new NextResponse('Forbidden: origin mismatch', { status: 403 })
      }
    }
  }

  // Pass through all other API routes without auth check, but inject x-vertical
  // so admin API routes can scope queries to the correct product vertical.
  if (pathname.startsWith('/api/')) {
    const apiHeaders = new Headers(request.headers)
    apiHeaders.set('x-vertical', vertical)
    return NextResponse.next({ request: { headers: apiHeaders } })
  }

  // Pass through public paths — still inject x-vertical so landing/signup pages can read it
  if (isPublic(pathname)) {
    const pubHeaders = new Headers(request.headers)
    pubHeaders.set('x-vertical', vertical)
    return NextResponse.next({ request: { headers: pubHeaders } })
  }

  // Inject pathname + vertical as headers so server layouts can read them via headers()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-vertical', vertical)

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

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // If the session exists but the refresh token is invalid/expired, clear the
    // stale sb-* cookies so the browser stops sending them on every request.
    if (authError) {
      request.cookies.getAll()
        .filter(c => c.name.startsWith('sb-'))
        .forEach(c => redirectResponse.cookies.delete(c.name))
    }
    return redirectResponse
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

        // Suspended accounts — redirect to suspension page (except the page itself)
        if (isSuspended(suspended_at) && !pathname.startsWith('/suspended')) {
          const url = request.nextUrl.clone()
          url.pathname = '/suspended'
          return NextResponse.redirect(url)
        }

        if (subscription_status === 'canceled' || isTrialExpired(subscription_status, trial_ends_at ?? null)) {
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
    '/api/gmail/webhook',
    '/api/inventory/cargurus-feed',
    '/api/inventory/facebook-feed',
    // Auth + subscription gating for all app routes
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
}
