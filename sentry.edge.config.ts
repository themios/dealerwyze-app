import * as Sentry from '@sentry/nextjs'

// For edge middleware, use environment variables to detect vertical
const isRE =
  process.env.VERCEL_URL?.includes('realtywyze') ||
  process.env.NEXT_PUBLIC_APP_URL?.includes('realtywyze') ||
  false

const dsn = isRE ? process.env.SENTRY_DSN_REALTY : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: 0.05,
  debug: false,
})
