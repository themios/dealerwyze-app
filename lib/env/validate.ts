/**
 * Startup env validation — call once from instrumentation.ts (nodejs runtime).
 * Throws on first missing required var so the deployment fails fast instead of
 * surfacing errors at request time.
 */

const REQUIRED: string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'STAFF_SESSION_SECRET',
  'CRON_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'SOCIAL_OAUTH_STATE_SECRET',
  'UNSUBSCRIBE_SECRET',
  // Remotion Lambda render-complete webhook HMAC — missing = all auto-post webhooks return 401
  'RENDER_WEBHOOK_SECRET',
]

/** Optional — dealer inbox two-way email degrades gracefully when unset */
export const OPTIONAL_DEALER_INBOX: string[] = [
  'RESEND_INBOUND_SECRET',
  'RESEND_REPLY_DOMAIN',
]

/** Optional — browser push notifications degrade gracefully when unset */
export const OPTIONAL_PUSH: string[] = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
]

/** Optional — RE listing intelligence degrades gracefully when unset */
export const OPTIONAL_RE_LISTING: string[] = [
  'APIFY_API_TOKEN',    // Zillow/Redfin URL scraping via Apify actors (~$0.002/import)
  'RENTCAST_API_KEY',   // Property AVM and CMA via RentCast API ($74/mo plan)
]

/** Optional — Cal.com webhook degrades gracefully when unset (bookings won't auto-create showings) */
export const OPTIONAL_RE_SHOWINGS: string[] = [
  'CALCOM_WEBHOOK_SECRET',  // HMAC-SHA256 secret from Cal.com webhook settings
]

/** Optional but important — Upstash Redis for distributed rate limiting (fail-closed fallback in production if missing) */
export const OPTIONAL_UPSTASH: string[] = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

const REQUIRED_IN_PROD_ONLY: string[] = [
  // BHPH ACH: signed customer setup links + Stripe ACH webhook (dealer Connect account)
  'BHPH_ACH_SECRET',
  'STRIPE_BHPH_ACH_WEBHOOK_SECRET',
  // R2 backup bucket — required in prod so the backup status page and signed-URL download work
  'R2_BUCKET_NAME',
  'R2_BACKUP_ACCESS_KEY_ID',
  'R2_BACKUP_SECRET_ACCESS_KEY',
  'R2_ACCOUNT_ID',
]

/**
 * Validate Upstash Redis configuration.
 *
 * Production behavior:
 * - Both vars present: no logging (success)
 * - Both vars missing: log warning (rate limits fail closed)
 * - Partial config: throw error (unsafe footgun)
 *
 * Development behavior:
 * - Both vars missing: no logging (acceptable for local dev)
 * - Partial config: log warning (catch accidental misconfiguration)
 */
export function validateUpstashConfig(): void {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const bothPresent = Boolean(url && token)
  const neitherPresent = !url && !token
  const partialPresent = (url && !token) || (!url && token)

  if (process.env.NODE_ENV === 'production') {
    if (neitherPresent) {
      // Both missing — warn
      console.warn(
        '[env] Rate limiting disabled: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN ' +
        'are not configured. Rate limits will fail closed in production.'
      )
    }
    if (partialPresent) {
      // One set, one missing — error
      throw new Error(
        '[env] Partial Upstash configuration: both UPSTASH_REDIS_REST_URL and ' +
        'UPSTASH_REDIS_REST_TOKEN must be set together. Check your environment.'
      )
    }
  } else {
    // Development
    if (partialPresent) {
      console.warn(
        '[env] Partial Upstash configuration: both UPSTASH_REDIS_REST_URL and ' +
        'UPSTASH_REDIS_REST_TOKEN should be set together. Rate limiting disabled.'
      )
    }
  }
}

export function validateEnv(): void {
  const required =
    process.env.NODE_ENV === 'production'
      ? [...REQUIRED, ...REQUIRED_IN_PROD_ONLY]
      : REQUIRED

  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}. ` +
      `See .env.example for documentation.`
    )
  }

  // Validate Upstash configuration (production warnings, dev flexibility)
  validateUpstashConfig()
}
