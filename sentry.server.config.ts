import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of performance traces
  tracesSampleRate: 0.1,

  // Don't log Sentry internals
  debug: false,
})
