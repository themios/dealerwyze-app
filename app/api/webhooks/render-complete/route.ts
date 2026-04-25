import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { incrementRenderQuota } from '@/lib/remotion/quotaCheck'
import { autoPostVideo } from '@/lib/social/autoPost'

const WEBHOOK_SECRET = process.env.RENDER_WEBHOOK_SECRET ?? ''

function verifyRemotionSignature(signature: string, body: string): boolean {
  if (!WEBHOOK_SECRET) return false
  try {
    const expected = crypto
      .createHmac('sha512', WEBHOOK_SECRET)
      .update(body, 'utf8')
      .digest('hex')
    const expectedBuf = Buffer.from(expected)
    const receivedBuf = Buffer.from(signature)
    if (expectedBuf.length !== receivedBuf.length) return false
    return crypto.timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// Remotion Lambda webhook payload shape
// https://www.remotion.dev/docs/lambda/webhooks
interface RenderCompletePayload {
  renderId: string
  type: 'success' | 'error' | 'timeout'
  // success fields
  outputUrl?: string
  outputFile?: string
  lambdaOutput?: { url?: string }
  // error fields
  errors?: Array<{ message: string }>
  // our custom pass-through fields (not sent by Remotion — parsed from renderId lookup)
  status?: 'complete' | 'failed'
  errorMessage?: string
  fileSizeBytes?: number
  autoPost?: boolean
  platforms?: string[]
}

// POST /api/webhooks/render-complete — called by Remotion Lambda when render finishes
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  // Remotion sends: X-Remotion-Signature: sha512=<hex>
  const signatureHeader = req.headers.get('x-remotion-signature') ?? ''
  const signature = signatureHeader.startsWith('sha512=')
    ? signatureHeader.slice(7)
    : signatureHeader

  if (!verifyRemotionSignature(signature, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RenderCompletePayload
  try {
    body = JSON.parse(rawBody) as RenderCompletePayload
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Log full payload to diagnose render failures
  console.log('[render-complete] payload:', JSON.stringify(body, null, 2))

  if (!body.renderId) {
    return NextResponse.json({ error: 'renderId required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch the render — Remotion's renderId is our lambda_render_id, not our UUID
  const { data: render } = await supabase
    .from('video_renders')
    .select('id, org_id, props_snapshot, auto_post, auto_post_platforms')
    .eq('lambda_render_id', body.renderId)
    .single()

  if (!render) {
    return NextResponse.json({ error: 'Render not found' }, { status: 404 })
  }

  const orgId = render.org_id

  // Map Remotion webhook payload to our status
  const isSuccess = body.type === 'success'
  const outputUrl = body.outputUrl ?? body.lambdaOutput?.url ?? body.outputFile ?? undefined
  const errorMessage = body.errors?.[0]?.message
    ?? (body as unknown as Record<string, unknown>).message as string | undefined
    ?? (isSuccess ? undefined : `Render failed (type=${body.type})`)

  // Update render status
  const updateData: Record<string, unknown> = {
    status:       isSuccess ? 'complete' : 'failed',
    completed_at: new Date().toISOString(),
  }
  if (outputUrl) {
    updateData.output_url = outputUrl
  }
  if (errorMessage) {
    updateData.error_message = errorMessage.slice(0, 500)
  }

  await supabase.from('video_renders').update(updateData).eq('id', render.id)

  if (isSuccess) {
    // Increment quota
    await incrementRenderQuota(orgId).catch(err => {
      console.error('[render-complete] quota increment failed:', err)
    })

    // Check org video settings for auto-post preference
    const { data: videoSettings } = await supabase
      .from('org_video_settings')
      .select('auto_post_on_listing, auto_post_platforms')
      .eq('org_id', orgId)
      .maybeSingle()

    // Use per-render preferences first, fall back to org defaults
    const shouldAutoPost = render.auto_post || (videoSettings?.auto_post_on_listing ?? false)
    const platforms      = render.auto_post_platforms?.length
      ? render.auto_post_platforms
      : (videoSettings?.auto_post_platforms ?? [])

    if (shouldAutoPost && platforms.length > 0) {
      autoPostVideo(render.id, platforms).catch(err => {
        console.error('[render-complete] autoPost failed:', err)
      })
    }
  }

  return NextResponse.json({ received: true })
}
