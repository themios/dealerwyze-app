import { createServiceClient } from '@/lib/supabase/service'
import { VehicleVideoProps } from '@/lib/remotion/types'
import { buildCaption } from './captionBuilder'
import { refreshSocialToken } from './tokenRefresh'
import { postVideoToFacebook, buildFacebookPostUrl } from './facebook'
import { postVideoToInstagram, buildInstagramPostUrl } from './instagram'
import { postVideoToTikTok, buildTikTokPostUrl } from './tiktok'
import { uploadVideoToYouTube, buildYouTubePostUrl } from './youtube'

interface SocialAccount {
  id: string
  org_id: string
  platform: string
  platform_account_id: string
  account_label: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  page_id: string | null
  instagram_business_account_id: string | null
  is_active: boolean
}

/**
 * Auto-post a completed video to all specified platforms.
 * Called by the render-complete webhook.
 * Errors per-platform are logged and recorded — never thrown to avoid blocking other platforms.
 */
export async function autoPostVideo(
  renderId: string,
  platforms?: string[],
): Promise<void> {
  const supabase = createServiceClient()

  // Fetch render + vehicle + org data
  const { data: render } = await supabase
    .from('video_renders')
    .select('*, vehicle:vehicles(*)')
    .eq('id', renderId)
    .single()

  if (!render || !render.output_url) {
    console.error('[autoPost] Render not found or no output_url:', renderId)
    return
  }

  const orgId    = render.org_id
  const vehicle  = render.vehicle
  const videoUrl = render.output_url

  // Fetch org settings for dealer branding
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('dealer_name, phone, city, state, website')
    .eq('org_id', orgId)
    .maybeSingle()

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  // Fetch org video settings for caption template
  const { data: videoSettings } = await supabase
    .from('org_video_settings')
    .select('caption_template, include_price, include_phone, watermark_enabled')
    .eq('org_id', orgId)
    .maybeSingle()

  // Build props snapshot for caption building
  const props: VehicleVideoProps = (render.props_snapshot as VehicleVideoProps) ?? {
    dealerName:    orgSettings?.dealer_name ?? org?.name ?? 'Dealer',
    dealerCity:    orgSettings?.city ?? '',
    dealerState:   orgSettings?.state ?? '',
    dealerPhone:   orgSettings?.phone ?? '',
    dealerWebsite: orgSettings?.website ?? undefined,
    year:    vehicle?.year ?? 0,
    make:    vehicle?.make ?? '',
    model:   vehicle?.model ?? '',
    trim:    vehicle?.trim ?? undefined,
    price:   vehicle?.price ?? 0,
    mileage: vehicle?.mileage ?? 0,
    color:   vehicle?.color ?? undefined,
    isSalvage: false,
    photos: [],
    features: [],
    showPrice:     videoSettings?.include_price  ?? true,
    showPhone:     videoSettings?.include_phone  ?? true,
    showWatermark: videoSettings?.watermark_enabled ?? true,
  }

  // Fetch connected + active social accounts for this org
  let accountsQuery = supabase
    .from('social_accounts')
    .select('id, org_id, platform, platform_account_id, account_label, access_token, refresh_token, token_expires_at, page_id, instagram_business_account_id, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (platforms && platforms.length > 0) {
    accountsQuery = accountsQuery.in('platform', platforms)
  }

  const { data: accounts } = await accountsQuery

  if (!accounts || accounts.length === 0) {
    console.log('[autoPost] No connected social accounts for org:', orgId)
    return
  }

  // Post to each platform concurrently
  await Promise.all(accounts.map(async (account: SocialAccount) => {
    // Create social_posts row as pending
    const { data: postRow } = await supabase
      .from('social_posts')
      .insert({
        org_id:            orgId,
        render_id:         renderId,
        vehicle_id:        render.vehicle_id,
        social_account_id: account.id,
        platform:          account.platform,
        caption:           buildCaption(props, account.platform, videoSettings?.caption_template),
        status:            'posting',
        attempt_count:     1,
      })
      .select('id')
      .single()

    if (!postRow) return

    const postId = postRow.id

    // Refresh token if needed
    try {
      await refreshSocialToken(account.id)
      // Re-fetch updated token
      const { data: refreshed } = await supabase
        .from('social_accounts')
        .select('access_token')
        .eq('id', account.id)
        .single()
      if (refreshed) account.access_token = refreshed.access_token
    } catch {
      // Non-fatal — try with existing token
    }

    try {
      const caption = buildCaption(props, account.platform, videoSettings?.caption_template)
      let platformPostId = ''
      let platformPostUrl = ''

      switch (account.platform) {
        case 'facebook': {
          const pageId = account.page_id ?? account.platform_account_id
          platformPostId  = await postVideoToFacebook(videoUrl, caption, pageId, account.access_token)
          platformPostUrl = buildFacebookPostUrl(pageId, platformPostId)
          break
        }
        case 'instagram': {
          const igId = account.instagram_business_account_id ?? account.platform_account_id
          platformPostId  = await postVideoToInstagram(videoUrl, caption, igId, account.access_token)
          platformPostUrl = buildInstagramPostUrl(platformPostId)
          break
        }
        case 'tiktok': {
          platformPostId  = await postVideoToTikTok(videoUrl, caption, account.access_token)
          platformPostUrl = buildTikTokPostUrl(platformPostId)
          break
        }
        case 'youtube': {
          const title = `${props.year} ${props.make} ${props.model}${props.trim ? ' ' + props.trim : ''} - ${props.dealerName}`
          platformPostId  = await uploadVideoToYouTube(videoUrl, title, caption, account.access_token)
          platformPostUrl = buildYouTubePostUrl(platformPostId)
          break
        }
        default:
          throw new Error(`Unknown platform: ${account.platform}`)
      }

      await supabase.from('social_posts').update({
        status:            'posted',
        platform_post_id:  platformPostId,
        platform_post_url: platformPostUrl,
        posted_at:         new Date().toISOString(),
      }).eq('id', postId)

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[autoPost] Failed to post to ${account.platform}:`, message)
      await supabase.from('social_posts').update({
        status:        'failed',
        error_message: message.slice(0, 500),
      }).eq('id', postId)
    }
  }))
}
