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
]

export function validateEnv(): void {
  const missing = REQUIRED.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}. ` +
      `See .env.example for documentation.`
    )
  }
}
