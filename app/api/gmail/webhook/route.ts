import { NextRequest } from 'next/server'
import { handleGmailPushWebhook } from '@/lib/gmail/pushWebhook'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return handleGmailPushWebhook(req, { audiencePath: '/api/gmail/webhook' })
}
