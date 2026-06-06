import * as Sentry from '@sentry/nextjs'

// Detect vertical from hostname (realtywyze.us vs dealerwyze.com)
const isRE = typeof window !== 'undefined' && window.location.hostname.includes('realtywyze')
const dsn = isRE ? process.env.NEXT_PUBLIC_SENTRY_DSN_REALTY : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,

  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllInputs: true,
      maskAllText: false,
      blockAllMedia: false,
      networkDetailAllowUrls: [],
    }),
    Sentry.browserTracingIntegration(),
  ],

  beforeSend(event) {
    if (event.user?.email) delete event.user.email
    if (event.user?.username) delete event.user.username

    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.headers) {
      const safe = ['content-type', 'x-forwarded-for', 'user-agent']
      const h = event.request.headers as Record<string, string>
      event.request.headers = Object.fromEntries(
        Object.entries(h).filter(([k]) => safe.includes(k.toLowerCase())),
      )
    }
    return event
  },

  debug: false,
})
