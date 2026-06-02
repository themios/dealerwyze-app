import { NextRequest, NextResponse } from 'next/server'
import { handleRemotionWebhookPost } from '@/lib/remotion/handleRemotionWebhook'

export const runtime = 'nodejs'

/**
 * Remotion Lambda completion webhook (Sprint 5 primary path).
 * Validates HMAC via `x-remotion-signature` + `RENDER_WEBHOOK_SECRET`.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  return handleRemotionWebhookPost(req)
}
