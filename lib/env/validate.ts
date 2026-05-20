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
}
