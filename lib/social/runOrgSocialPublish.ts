import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'
import { createServiceClient } from '@/lib/supabase/service'
import type { DealerSocialPlatform, SocialPlacement } from '@/lib/social/publishListingMedia'
import { publishListingToMetaNetworks, type OrgPostingRow } from '@/lib/social/publishListingMedia'

export function captionForListing(v: {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  price: number | null
  mileage: number | null
}): string {
  const label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')
  const priceStr =
    v.price != null && !Number.isNaN(Number(v.price))
      ? `$${Number(v.price).toLocaleString('en-US')}`
      : 'Call for price'
  const mileageStr =
    v.mileage != null ? `${Number(v.mileage).toLocaleString('en-US')} miles` : ''
  const mid = mileageStr ? ` · ${mileageStr}` : ''
  const head = label.trim() ? `${label} — ${priceStr}` : `${priceStr}`
  return `${head}${mid}. Message us to schedule a test drive.`
}

function normalizePlatforms(raw: unknown): DealerSocialPlatform[] {
  const list = Array.isArray(raw) ? raw : []
  const out: DealerSocialPlatform[] = []
  for (const p of list.slice(0, 8)) {
    if (p === 'facebook' || p === 'instagram') out.push(p)
  }
  return [...new Set(out)]
}

type LogRow = {
  status: string
  error_message: string | null
}

function deriveStatus(item: {
  platformPostUrl: string | null
  graphObjectId: string | null
  error?: string
  skippedReason?: string
}): LogRow {
  if (item.skippedReason) {
    return { status: 'skipped', error_message: item.skippedReason }
  }
  if (item.error) {
    return { status: 'failed', error_message: item.error }
  }
  return { status: 'posted', error_message: null }
}

/**
 * Saves `social_publish_log` rows then returns combined results (used by APIs + webhooks).
 */
export async function runOrgSocialPublish(options: {
  orgId: string
  vehicleId: string
  videoRenderId?: string | null
  mediaUrl: string
  mediaKind: 'image' | 'video'
  caption: string
  platforms: unknown
  placement?: SocialPlacement
}): Promise<{
  results: Array<{
    platform: DealerSocialPlatform
    placement: SocialPlacement
    platformPostUrl: string | null
    ok: boolean
    message?: string
  }>
}> {
  assertSafeOutboundMediaUrl(options.mediaUrl)

  const supabase = createServiceClient()

  const { data: orgRow, error: orgErr } = await supabase
    .from('org_social_posting')
    .select('*')
    .eq('org_id', options.orgId)
    .maybeSingle()

  if (orgErr) {
    console.error('[runOrgSocialPublish] org fetch:', orgErr.message)
  }

  if (!orgRow) {
    return {
      results: normalizePlatforms(options.platforms).map(platform => ({
        platform,
        placement: options.placement ?? 'feed',
        platformPostUrl: null,
        ok: false,
        message: 'Social posting not configured for this dealership.',
      })),
    }
  }

  const platforms = normalizePlatforms(options.platforms)
  if (platforms.length === 0) {
    return {
      results: [],
    }
  }

  const placement = options.placement ?? 'feed'

  const published = await publishListingToMetaNetworks({
    orgRow: orgRow as OrgPostingRow,
    mediaUrl: options.mediaUrl,
    mediaKind: options.mediaKind,
    caption: options.caption,
    platforms,
    placement,
  })

  const resultsOut: Array<{
    platform: DealerSocialPlatform
    placement: SocialPlacement
    platformPostUrl: string | null
    ok: boolean
    message?: string
  }> = []

  for (const item of published) {
    const { status, error_message } = deriveStatus(item)

    const { error: logErr } = await supabase.from('social_publish_log').insert({
      org_id:            options.orgId,
      vehicle_id:        options.vehicleId,
      video_render_id:   options.videoRenderId ?? null,
      platform:          item.platform,
      placement:         item.placement,
      status,
      platform_post_url: item.platformPostUrl,
      graph_object_id:   item.graphObjectId,
      error_message,
      caption:           options.caption,
      posted_at:         status === 'posted' ? new Date().toISOString() : null,
    })
    if (logErr) {
      console.error('[runOrgSocialPublish] audit log insert failed:', logErr.message)
    }

    const ok = status === 'posted'
    resultsOut.push({
      platform:          item.platform,
      placement:         item.placement,
      platformPostUrl:   item.platformPostUrl,
      ok,
      message:           ok ? undefined : (error_message ?? item.error ?? 'Skipped'),
    })
  }

  return { results: resultsOut }
}
