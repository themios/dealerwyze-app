import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'

export const dynamic = 'force-dynamic'

type IntegrationStatus = 'ok' | 'partial' | 'missing'

type IntegrationEntry = {
  key: string
  label: string
  vars: Array<{ name: string; present: boolean }>
  status: IntegrationStatus
}

function withStatus(entry: Omit<IntegrationEntry, 'status'>): IntegrationEntry {
  const presentCount = entry.vars.filter(v => v.present).length
  const status: IntegrationStatus =
    presentCount === entry.vars.length
      ? 'ok'
      : presentCount === 0
        ? 'missing'
        : 'partial'
  return { ...entry, status }
}

function buildIntegrations(): IntegrationEntry[] {
  return [
    withStatus({
      key: 'twilio',
      label: 'Twilio (SMS + Voice)',
      vars: [
        { name: 'TWILIO_ACCOUNT_SID', present: !!process.env.TWILIO_ACCOUNT_SID },
        { name: 'TWILIO_AUTH_TOKEN', present: !!process.env.TWILIO_AUTH_TOKEN },
        { name: 'TWILIO_FROM_NUMBER', present: !!process.env.TWILIO_FROM_NUMBER },
      ],
    }),
    withStatus({
      key: 'stripe',
      label: 'Stripe (Billing)',
      vars: [
        { name: 'STRIPE_SECRET_KEY', present: !!process.env.STRIPE_SECRET_KEY },
        { name: 'STRIPE_WEBHOOK_SECRET', present: !!process.env.STRIPE_WEBHOOK_SECRET },
        {
          name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
          present: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        },
      ],
    }),
    withStatus({
      key: 'resend',
      label: 'Resend (Email)',
      vars: [
        { name: 'RESEND_API_KEY', present: !!process.env.RESEND_API_KEY },
        { name: 'RESEND_FROM_DOMAIN', present: !!process.env.RESEND_FROM_DOMAIN },
      ],
    }),
    withStatus({
      key: 'groq',
      label: 'Groq (AI)',
      vars: [{ name: 'GROQ_API_KEY', present: !!process.env.GROQ_API_KEY }],
    }),
    withStatus({
      key: 'anthropic',
      label: 'Anthropic (AI)',
      vars: [{ name: 'ANTHROPIC_API_KEY', present: !!process.env.ANTHROPIC_API_KEY }],
    }),
    withStatus({
      key: 'retell',
      label: 'Retell (AI Voice)',
      vars: [
        { name: 'RETELL_API_KEY', present: !!process.env.RETELL_API_KEY },
        { name: 'RETELL_AGENT_ID', present: !!process.env.RETELL_AGENT_ID },
        { name: 'RETELL_WEBHOOK_SECRET', present: !!process.env.RETELL_WEBHOOK_SECRET },
      ],
    }),
    withStatus({
      key: 'meta',
      label: 'Meta (Facebook + Instagram)',
      vars: [
        { name: 'META_APP_ID', present: !!process.env.META_APP_ID },
        { name: 'META_APP_SECRET', present: !!process.env.META_APP_SECRET },
      ],
    }),
    withStatus({
      key: 'tiktok',
      label: 'TikTok',
      vars: [
        { name: 'TIKTOK_CLIENT_KEY', present: !!process.env.TIKTOK_CLIENT_KEY },
        { name: 'TIKTOK_CLIENT_SECRET', present: !!process.env.TIKTOK_CLIENT_SECRET },
      ],
    }),
    withStatus({
      key: 'youtube',
      label: 'YouTube',
      vars: [
        { name: 'YOUTUBE_CLIENT_ID', present: !!process.env.YOUTUBE_CLIENT_ID },
        { name: 'YOUTUBE_CLIENT_SECRET', present: !!process.env.YOUTUBE_CLIENT_SECRET },
      ],
    }),
    withStatus({
      key: 'remotion',
      label: 'Remotion Lambda (Video)',
      vars: [
        { name: 'REMOTION_AWS_ACCESS_KEY_ID', present: !!process.env.REMOTION_AWS_ACCESS_KEY_ID },
        { name: 'REMOTION_AWS_SECRET_ACCESS_KEY', present: !!process.env.REMOTION_AWS_SECRET_ACCESS_KEY },
        { name: 'REMOTION_S3_BUCKET', present: !!process.env.REMOTION_S3_BUCKET },
        { name: 'REMOTION_FUNCTION_NAME', present: !!process.env.REMOTION_FUNCTION_NAME },
      ],
    }),
    withStatus({
      key: 'upstash',
      label: 'Upstash Redis (Rate Limiting)',
      vars: [
        { name: 'UPSTASH_REDIS_REST_URL', present: !!process.env.UPSTASH_REDIS_REST_URL },
        { name: 'UPSTASH_REDIS_REST_TOKEN', present: !!process.env.UPSTASH_REDIS_REST_TOKEN },
      ],
    }),
    withStatus({
      key: 'telegram',
      label: 'Telegram (Alerts)',
      vars: [
        { name: 'TELEGRAM_BOT_TOKEN', present: !!process.env.TELEGRAM_BOT_TOKEN },
        { name: 'TELEGRAM_CHAT_ID', present: !!process.env.TELEGRAM_CHAT_ID },
      ],
    }),
    withStatus({
      key: 'social_oauth',
      label: 'Social OAuth State (Security)',
      vars: [{ name: 'SOCIAL_OAUTH_STATE_SECRET', present: !!process.env.SOCIAL_OAUTH_STATE_SECRET }],
    }),
  ]
}

export async function GET() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ integrations: buildIntegrations() })
}
