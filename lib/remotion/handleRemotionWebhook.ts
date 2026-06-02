import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyRemotionWebhookSignature } from '@/lib/social/metaGraph'
import { applyRemotionRenderWebhook } from '@/lib/social/applyRenderWebhook'

const MAX_WEBHOOK_BYTES = 512 * 1024

export async function handleRemotionWebhookPost(
  req: NextRequest,
): Promise<NextResponse> {
  const rawBody = await req.text()
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const sig = req.headers.get('x-remotion-signature')
  const secret = process.env.RENDER_WEBHOOK_SECRET ?? ''

  if (!verifyRemotionWebhookSignature(rawBody, secret, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const body = {
    type:
      typeof parsed.type === 'string'
        ? parsed.type
        : undefined,
    renderId:
      typeof parsed.renderId === 'string'
        ? parsed.renderId
        : typeof parsed.render_id === 'string'
          ? (parsed.render_id as string)
          : undefined,
    outputUrl:
      typeof parsed.outputUrl === 'string'
        ? parsed.outputUrl
        : undefined,
    errors:
      parsed.errors ?? parsed.lambdaErrors,
  }

  const result = await applyRemotionRenderWebhook(body)

  return NextResponse.json({ ok: true, ...result })
}
