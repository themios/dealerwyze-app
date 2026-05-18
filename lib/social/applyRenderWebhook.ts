import { createServiceClient } from '@/lib/supabase/service'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'
import {
  captionForListing,
  runOrgSocialPublish,
} from '@/lib/social/runOrgSocialPublish'
import { autoPostContentRender } from '@/lib/content/autoPostContent'

export interface RemotionRenderWebhookBody {
  type?: string
  renderId?: string
  outputUrl?: string
  errors?: unknown
}

/** Updates `video_renders` after Remotion Lambda webhooks + optional Meta auto-post. */
export async function applyRemotionRenderWebhook(
  body: RemotionRenderWebhookBody,
): Promise<{
  matched: boolean
  autoPosted?: boolean
  duplicateWebhook?: boolean
}> {
  const renderId = typeof body.renderId === 'string' ? body.renderId.trim() : ''
  if (!renderId) return { matched: false }

  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('video_renders')
    .select(
      'id, org_id, vehicle_id, auto_post, auto_post_platforms, status, output_url',
    )
    .eq('lambda_render_id', renderId)
    .maybeSingle()

  if (!row) {
    // Check content_renders table as fallback
    return applyContentRenderWebhook(body, renderId)
  }

  const completedAt = new Date().toISOString()
  let autoPosted = false

  if (body.type === 'success') {
    if (
      typeof body.outputUrl !== 'string' ||
      !body.outputUrl.startsWith('http')
    ) {
      await supabase
        .from('video_renders')
        .update({
          status:        'failed',
          completed_at:  completedAt,
          error_message: 'Render reported success but no output URL was provided.',
        })
        .eq('id', row.id)
      return { matched: true, autoPosted: false }
    }

    try {
      assertSafeOutboundMediaUrl(body.outputUrl)
    } catch {
      await supabase
        .from('video_renders')
        .update({
          status:        'failed',
          completed_at:  completedAt,
          error_message:
            'Render output URL failed enterprise policy checks (HTTPS / host).',
        })
        .eq('id', row.id)
      return { matched: true, autoPosted: false }
    }

    const dupSuccess =
      row.status === 'complete' &&
      typeof row.output_url === 'string' &&
      row.output_url === body.outputUrl
    if (dupSuccess) {
      return { matched: true, duplicateWebhook: true }
    }

    await supabase
      .from('video_renders')
      .update({
        status:        'complete',
        output_url:    body.outputUrl,
        completed_at:  completedAt,
        error_message: null,
      })
      .eq('id', row.id)

    if (row.auto_post && Array.isArray(row.auto_post_platforms) && row.auto_post_platforms.length > 0) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('year, make, model, trim, price, mileage')
        .eq('id', row.vehicle_id)
        .eq('user_id', row.org_id)
        .maybeSingle()

      const caption = vehicle ? captionForListing(vehicle) : 'New inventory highlight — tap to watch.'

      const { results } = await runOrgSocialPublish({
        orgId:           row.org_id,
        vehicleId:       row.vehicle_id,
        videoRenderId:   row.id,
        mediaUrl:        body.outputUrl,
        mediaKind:       'video',
        caption,
        platforms:       row.auto_post_platforms,
        placement:       'feed',
      })
      autoPosted = results.some(r => r.ok)
    }

    return { matched: true, autoPosted }
  }

  let errMsg =
    typeof body.type === 'string' && body.type !== 'success'
      ? `Render ${body.type}`
      : 'Render failed'

  if (body.errors !== undefined && body.errors !== null) {
    try {
      errMsg = `${errMsg}: ${typeof body.errors === 'string' ? body.errors : JSON.stringify(body.errors).slice(0, 500)}`
    } catch {
      errMsg = `${errMsg} (unable to stringify errors)`
    }
  }

  await supabase
    .from('video_renders')
    .update({
      status:        'failed',
      completed_at:  completedAt,
      error_message: errMsg.slice(0, 2_000),
    })
    .eq('id', row.id)

  return { matched: true, autoPosted: false }
}

async function applyContentRenderWebhook(
  body: RemotionRenderWebhookBody,
  lambdaRenderId: string,
): Promise<{ matched: boolean; autoPosted?: boolean; duplicateWebhook?: boolean }> {
  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('content_renders')
    .select('id, org_id, auto_post, auto_post_platforms, status, output_url')
    .eq('lambda_render_id', lambdaRenderId)
    .maybeSingle()

  if (!row) return { matched: false }

  const completedAt = new Date().toISOString()

  if (body.type === 'success') {
    if (typeof body.outputUrl !== 'string' || !body.outputUrl.startsWith('http')) {
      await supabase
        .from('content_renders')
        .update({ status: 'failed', completed_at: completedAt, error_message: 'No output URL returned.' })
        .eq('id', row.id)
      return { matched: true, autoPosted: false }
    }

    try { assertSafeOutboundMediaUrl(body.outputUrl) } catch {
      await supabase
        .from('content_renders')
        .update({ status: 'failed', completed_at: completedAt, error_message: 'Output URL failed policy checks.' })
        .eq('id', row.id)
      return { matched: true, autoPosted: false }
    }

    if (row.status === 'complete' && row.output_url === body.outputUrl) {
      return { matched: true, duplicateWebhook: true }
    }

    await supabase
      .from('content_renders')
      .update({ status: 'complete', output_url: body.outputUrl, completed_at: completedAt, error_message: null })
      .eq('id', row.id)

    let autoPosted = false
    if (row.auto_post && Array.isArray(row.auto_post_platforms) && row.auto_post_platforms.length > 0) {
      const results = await autoPostContentRender(row.id)
      autoPosted = results.some(r => r.ok)
    }

    return { matched: true, autoPosted }
  }

  let errMsg = typeof body.type === 'string' ? `Render ${body.type}` : 'Render failed'
  if (body.errors) {
    try { errMsg += `: ${typeof body.errors === 'string' ? body.errors : JSON.stringify(body.errors).slice(0, 500)}` } catch { /* ok */ }
  }
  await supabase
    .from('content_renders')
    .update({ status: 'failed', completed_at: completedAt, error_message: errMsg.slice(0, 2000) })
    .eq('id', row.id)

  return { matched: true, autoPosted: false }
}
