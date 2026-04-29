import { NextRequest } from 'next/server'
import { handleGmailPushWebhook } from '@/lib/gmail/pushWebhook'

export const runtime = 'nodejs'

/**
 * Legacy compatibility shim.
 *
 * Preferred secure endpoint: /api/gmail/webhook using Google OIDC push auth.
 * This older path still accepts the legacy verification token temporarily so
 * existing Pub/Sub subscriptions do not break during migration.
 */
export async function POST(req: NextRequest) {
  return handleGmailPushWebhook(req, {
    audiencePath: '/api/integrations/gmail/push',
    allowLegacyToken: true,
  })
}
