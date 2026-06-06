import * as Sentry from '@sentry/nextjs'

// For server-side, use environment variable to detect vertical
// In production, VERCEL_URL will be different per deployment
// In development, check NEXT_PUBLIC_APP_URL
const isRE =
  process.env.VERCEL_URL?.includes('realtywyze') ||
  process.env.NEXT_PUBLIC_APP_URL?.includes('realtywyze') ||
  false

const dsn = isRE ? process.env.SENTRY_DSN_REALTY : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    if (event.request?.data) event.request.data = '[redacted]'
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.headers) {
      const safe = ['content-type', 'x-forwarded-for', 'user-agent', 'x-pathname']
      const h = event.request.headers as Record<string, string>
      event.request.headers = Object.fromEntries(
        Object.entries(h).filter(([k]) => safe.includes(k.toLowerCase())),
      )
    }
    return event
  },

  debug: false,
})
