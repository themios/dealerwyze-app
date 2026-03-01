import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Rate limiting (formerly middleware.ts) ────────────────────────────────────
// In-process sliding window — good enough for <10 dealers on Vercel.

interface RateEntry { count: number; resetAt: number }
const store = new Map<string, RateEntry>()

const RATE_ROUTES: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: '/api/twilio/inbound',          limit: 60,  windowMs: 60_000 },
  { prefix: '/api/voice/retell-callback',   limit: 30,  windowMs: 60_000 },
  { prefix: '/api/inventory/cargurus-feed', limit: 10,  windowMs: 60_000 },
  { prefix: '/api/inventory/facebook-feed', limit: 10,  windowMs: 60_000 },
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

// ── Auth + subscription gating (original proxy.ts) ───────────────────────────

const PUBLIC_PATHS    = ['/', '/login', '/signup', '/privacy', '/terms', '/privacy.html', '/terms.html', '/forgot-password', '/reset-password']
const PUBLIC_PREFIXES = ['/auth/', '/api/auth/', '/api/stripe/webhook', '/_next/']
const PUBLIC_FILES    = ['/favicon.ico', '/logo.jpg', '/manifest.json']
const BILLING_EXEMPT  = ['/settings/billing', '/settings/users']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (PUBLIC_FILES.includes(pathname)) return true
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true
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

  let supabaseResponse = NextResponse.next({ request })

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
        .select('subscription_status, trial_ends_at')
        .eq('id', profile.org_id)
        .maybeSingle()

      if (org) {
        const { subscription_status, trial_ends_at } = org
        const trialExpired =
          subscription_status === 'trialing' &&
          trial_ends_at &&
          new Date(trial_ends_at) < new Date()

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
