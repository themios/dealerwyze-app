import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { ContentReelProps } from '@/lib/remotion/types'
import { generateContentCaption } from './captionGenerator'
import { postReelToFacebook }    from '@/lib/social/facebook'
import { postVideoToInstagram }  from '@/lib/social/instagram'
import { postVideoToTikTok }     from '@/lib/social/tiktok'
import { uploadVideoToYouTube }  from '@/lib/social/youtube'
import { refreshSocialToken }    from '@/lib/social/tokenRefresh'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'

interface PostResult {
  platform: string
  ok: boolean
  platformPostId?: string
  error?: string
}

export async function autoPostContentRender(
  contentRenderId: string,
): Promise<PostResult[]> {
  const supabase = createServiceClient()

  const { data: render } = await supabase
    .from('content_renders')
    .select('id, org_id, output_url, props_snapshot, auto_post_platforms')
    .eq('id', contentRenderId)
    .single()

  if (!render?.output_url) {
    console.error('[autoPostContent] Render not found or no output_url:', contentRenderId)
    return []
  }

  try {
    assertSafeOutboundMediaUrl(render.output_url)
  } catch {
    console.error('[autoPostContent] Unsafe output URL:', render.output_url)
    return []
  }

  const orgId    = render.org_id
  const videoUrl = render.output_url
  const props    = render.props_snapshot as ContentReelProps
  const platforms: string[] = Array.isArray(render.auto_post_platforms)
    ? render.auto_post_platforms
    : []

  if (platforms.length === 0) return []

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, org_id, platform, platform_account_id, account_label, access_token, refresh_token, token_expires_at, page_id, instagram_business_account_id, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('platform', platforms)

  if (!accounts?.length) return []

  const results: PostResult[] = await Promise.all(
    accounts.map(async (account) => {
      if (account.org_id !== orgId) return { platform: account.platform, ok: false, error: 'org mismatch' }

      try {
        await refreshSocialToken(account.id, orgId)
        const { data: refreshed } = await supabase
          .from('social_accounts')
          .select('access_token')
          .eq('id', account.id)
          .single()
        if (refreshed) account.access_token = refreshed.access_token
      } catch { /* non-fatal */ }

      const caption = await generateContentCaption(props, account.platform)

      try {
        let platformPostId = ''
        switch (account.platform) {
          case 'facebook': {
            const pageId = account.page_id ?? account.platform_account_id
            platformPostId = await postReelToFacebook(videoUrl, caption, pageId, account.access_token)
            break
          }
          case 'instagram': {
            const igId = account.instagram_business_account_id ?? account.platform_account_id
            platformPostId = await postVideoToInstagram(videoUrl, caption, igId, account.access_token)
            break
          }
          case 'tiktok': {
            platformPostId = await postVideoToTikTok(videoUrl, caption, account.access_token)
            break
          }
          case 'youtube': {
            platformPostId = await uploadVideoToYouTube(videoUrl, props.topic, caption, account.access_token)
            break
          }
          default:
            return { platform: account.platform, ok: false, error: `unsupported platform: ${account.platform}` }
        }
        return { platform: account.platform, ok: true, platformPostId }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[autoPostContent] Failed ${account.platform}:`, msg)
        return { platform: account.platform, ok: false, error: msg.slice(0, 300) }
      }
    }),
  )

  // Persist results
  await supabase
    .from('content_renders')
    .update({ post_results: results })
    .eq('id', contentRenderId)

  return results
}
