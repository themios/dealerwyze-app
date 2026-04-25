import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of sessions as replays (free tier friendly)
  replaysSessionSampleRate: 0.1,
  // Always capture replays for sessions with an error
  replaysOnErrorSampleRate: 1.0,

  // Capture 10% of performance traces
  tracesSampleRate: 0.1,

  // Attach user context from Supabase auth if available
  debug: false,
})
