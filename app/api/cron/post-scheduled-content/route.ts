import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { postReelToFacebook }    from '@/lib/social/facebook'
import { postVideoToInstagram }  from '@/lib/social/instagram'
import { postVideoToTikTok }     from '@/lib/social/tiktok'
import { uploadVideoToYouTube }  from '@/lib/social/youtube'
import { refreshSocialToken }    from '@/lib/social/tokenRefresh'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'

export const maxDuration = 120

// GET /api/cron/post-scheduled-content
// Publishes content_drafts that are rendered, have a scheduled_at in the past,
// and have not yet been posted. Runs every 5 minutes.
export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Find all rendered drafts scheduled for <= now
  const { data: dueDrafts, error: queryError } = await supabase
    .from('content_drafts')
    .select('id, org_id, topic, platform_targets, platform_captions, render_id, scheduled_at')
    .eq('status', 'rendered')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .limit(20)

  if (queryError) {
    console.error('[post-scheduled-content] Query error:', queryError)
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 })
  }

  if (!dueDrafts?.length) {
    // Debug: check raw count with no filters
    const { count } = await supabase.from('content_drafts').select('id', { count: 'exact', head: true })
    return NextResponse.json({ ok: true, processed: 0, debug_total_drafts: count, debug_now: now })
  }

  const results: { draftId: string; topic: string; posted: string[]; errors: string[] }[] = []

  for (const draft of dueDrafts) {
    const draftId  = draft.id as string
    const orgId    = draft.org_id as string
    const platforms: string[] = Array.isArray(draft.platform_targets) ? draft.platform_targets : []
    const captions: Record<string, string> = (draft.platform_captions as Record<string, string>) ?? {}

    // Mark as archived immediately to prevent double-posting on concurrent runs
    const { error: lockErr, count: lockCount } = await supabase
      .from('content_drafts')
      .update({ status: 'archived', updated_at: now })
      .eq('id', draftId)
      .eq('status', 'rendered') // only update if still rendered (optimistic lock)
    if (lockErr) {
      results.push({ draftId, topic: draft.topic as string, posted: [], errors: [`lock failed: ${lockErr.message}`] })
      continue
    }
    if (lockCount === 0) {
      // Another runner already claimed it
      continue
    }

    // Get the rendered video URL
    if (!draft.render_id) {
      results.push({ draftId, topic: draft.topic as string, posted: [], errors: ['No render_id'] })
      continue
    }

    const { data: render } = await supabase
      .from('content_renders')
      .select('output_url')
      .eq('id', draft.render_id as string)
      .eq('status', 'complete')
      .maybeSingle()

    if (!render?.output_url) {
      results.push({ draftId, topic: draft.topic as string, posted: [], errors: ['Render not complete'] })
      continue
    }

    try {
      assertSafeOutboundMediaUrl(render.output_url)
    } catch {
      results.push({ draftId, topic: draft.topic as string, posted: [], errors: ['Unsafe video URL'] })
      continue
    }

    const videoUrl = render.output_url

    // Load active social accounts for this org matching the target platforms
    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('id, platform, platform_account_id, access_token, refresh_token, token_expires_at, page_id, instagram_business_account_id')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .in('platform', platforms)

    const posted: string[] = []
    const errors: string[] = []

    for (const account of accounts ?? []) {
      try {
        await refreshSocialToken(account.id, orgId)
        const { data: refreshed } = await supabase
          .from('social_accounts')
          .select('access_token')
          .eq('id', account.id)
          .single()
        if (refreshed) account.access_token = refreshed.access_token

        const caption = captions[account.platform] ?? captions['instagram'] ?? draft.topic as string

        switch (account.platform) {
          case 'facebook': {
            const pageId = account.page_id ?? account.platform_account_id
            await postReelToFacebook(videoUrl, caption, pageId, account.access_token)
            break
          }
          case 'instagram': {
            const igId = account.instagram_business_account_id ?? account.platform_account_id
            await postVideoToInstagram(videoUrl, caption, igId, account.access_token)
            break
          }
          case 'tiktok':
            await postVideoToTikTok(videoUrl, caption, account.access_token)
            break
          case 'youtube':
            await uploadVideoToYouTube(videoUrl, draft.topic as string, caption, account.access_token)
            break
          default:
            errors.push(`unsupported: ${account.platform}`)
            continue
        }
        posted.push(account.platform)
      } catch (err) {
        errors.push(`${account.platform}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200))
      }
    }

    results.push({ draftId, topic: draft.topic as string, posted, errors })
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
