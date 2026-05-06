import { metaGraphGet, metaGraphPostForm } from './metaGraph'

export type DealerSocialPlatform = 'facebook' | 'instagram'

export type SocialPlacement = 'feed' | 'story'

export interface OrgPostingRow {
  meta_page_id: string | null
  meta_page_access_token: string | null
  instagram_business_account_id: string | null
  facebook_feed: boolean
  instagram_feed: boolean
  facebook_story: boolean
  instagram_story: boolean
}

export interface PublishListingParams {
  orgRow: OrgPostingRow
  mediaUrl: string
  /** Public image or video URL (Meta fetches server-side — must be reachable). */
  mediaKind: 'image' | 'video'
  caption: string
  platforms: DealerSocialPlatform[]
  placement?: SocialPlacement
}

export interface PublishListingResultItem {
  platform: DealerSocialPlatform
  placement: SocialPlacement
  platformPostUrl: string | null
  graphObjectId: string | null
  error?: string
  skippedReason?: string
}

// 30 × 2s = 60 s max — stays well inside maxDuration:120 even with concurrent FB call.
const IG_POLL_MAX = 30

async function waitForInstagramContainer(containerId: string, accessToken: string): Promise<void> {
  const urlPath = `/${containerId}`
  for (let i = 0; i < IG_POLL_MAX; i++) {
    const j = await metaGraphGet<{
      status_code?: string
      status?: string
    }>(urlPath, { fields: 'status_code', access_token: accessToken })

    const code = j.status_code ?? j.status
    if (code === 'FINISHED') return
    if (code === 'ERROR') {
      throw new Error('Instagram rejected this media (format, aspect ratio, or URL).')
    }
    await new Promise(r => setTimeout(r, 2_000))
  }
  throw new Error('Instagram media processing timed out')
}

async function publishFacebookFeed(
  pageId: string,
  token: string,
  caption: string,
  mediaKind: 'image' | 'video',
  mediaUrl: string,
): Promise<{ permalink: string; graphId: string }> {
  if (mediaKind === 'video') {
    const j = await metaGraphPostForm<{ id: string }>(`/${pageId}/videos`, {
      file_url: mediaUrl,
      description: caption,
      access_token: token,
    })
    return {
      graphId: j.id,
      permalink: `https://www.facebook.com/${pageId}/videos/${j.id}`,
    }
  }
  const j = await metaGraphPostForm<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
    url: mediaUrl,
    caption,
    published: 'true',
    access_token: token,
  })
  const postKey = j.post_id ?? j.id
  const tail = postKey.includes('_') ? postKey.replace(/^.+?_/, '') : postKey
  return {
    graphId: j.id,
    permalink: `https://www.facebook.com/${tail}`,
  }
}

async function publishInstagramFeed(
  igUserId: string,
  token: string,
  caption: string,
  mediaKind: 'image' | 'video',
  mediaUrl: string,
): Promise<{ permalink: string; graphId: string }> {
  const baseParams: Record<string, string> = {
    access_token: token,
    caption,
  }
  if (mediaKind === 'video') {
    baseParams.media_type = 'REELS'
    baseParams.video_url = mediaUrl
  } else {
    baseParams.image_url = mediaUrl
  }

  const create = await metaGraphPostForm<{ id: string }>(`/${igUserId}/media`, baseParams)

  await waitForInstagramContainer(create.id, token)

  const published = await metaGraphPostForm<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: create.id,
    access_token: token,
  })

  const info = await metaGraphGet<{ permalink?: string }>(`/${published.id}`, {
    fields: 'permalink',
    access_token: token,
  })

  return {
    graphId: published.id,
    permalink:
      info.permalink ?? `https://www.instagram.com/p/${published.id}/`,
  }
}

async function publishInstagramStory(
  igUserId: string,
  token: string,
  mediaKind: 'image' | 'video',
  mediaUrl: string,
): Promise<{ permalink: string; graphId: string }> {
  if (mediaKind === 'video') {
    throw new Error(
      'Instagram Stories for video uses a different upload flow — use Feed/Reels video or upload a portrait image for Stories.',
    )
  }
  const create = await metaGraphPostForm<{ id: string }>(`/${igUserId}/media`, {
    access_token: token,
    media_type: 'STORIES',
    image_url: mediaUrl,
  })

  await waitForInstagramContainer(create.id, token)

  const published = await metaGraphPostForm<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: create.id,
    access_token: token,
  })

  const info = await metaGraphGet<{ permalink?: string }>(`/${published.id}`, {
    fields: 'permalink',
    access_token: token,
  })

  return {
    graphId: published.id,
    permalink: info.permalink ?? '',
  }
}

/**
 * Posts listing media to Meta. Feed posts (FB photo/video, IG image/Reels video) plus IG image Stories when enabled.
 * Facebook Stories are not implemented (Graph product limitations vary).
 */
export async function publishListingToMetaNetworks(
  params: PublishListingParams,
): Promise<PublishListingResultItem[]> {
  const {
    orgRow,
    mediaUrl,
    mediaKind,
    caption,
    platforms,
    placement = 'feed',
  } = params

  const pageId = orgRow.meta_page_id?.trim() || ''
  const token = orgRow.meta_page_access_token?.trim() || ''
  const igUserId = orgRow.instagram_business_account_id?.trim() || ''

  if (!token || !pageId) {
    const reason =
      'Meta Page ID or Page access token missing — configure Social posting in Organization settings.'
    return platforms.map(platform => ({
      platform,
      placement,
      platformPostUrl: null,
      graphObjectId: null,
      skippedReason: reason,
    }))
  }

  const out: PublishListingResultItem[] = []

  async function fb(): Promise<void> {
    if (placement === 'story') {
      out.push({
        platform: 'facebook',
        placement: 'story',
        platformPostUrl: null,
        graphObjectId: null,
        skippedReason: !orgRow.facebook_story
          ? 'Facebook Stories are turned off.'
          : 'Facebook Page Stories are not available via this integration yet.',
      })
      return
    }
    if (!platforms.includes('facebook')) return
    if (!orgRow.facebook_feed) {
      out.push({
        platform: 'facebook',
        placement: 'feed',
        platformPostUrl: null,
        graphObjectId: null,
        skippedReason: 'Facebook feed posting is disabled for this dealership.',
      })
      return
    }
    try {
      const r = await publishFacebookFeed(pageId, token, caption, mediaKind, mediaUrl)
      out.push({
        platform: 'facebook',
        placement: 'feed',
        platformPostUrl: r.permalink,
        graphObjectId: r.graphId,
      })
    } catch (e) {
      out.push({
        platform: 'facebook',
        placement: 'feed',
        platformPostUrl: null,
        graphObjectId: null,
        error: e instanceof Error ? e.message : 'Facebook post failed',
      })
    }
  }

  async function ig(): Promise<void> {
    if (!platforms.includes('instagram')) return
    if (!igUserId) {
      out.push({
        platform: 'instagram',
        placement,
        platformPostUrl: null,
        graphObjectId: null,
        skippedReason: 'Instagram Business account ID missing — paste the IG User ID from Meta Business Suite.',
      })
      return
    }
    if (placement === 'story') {
      if (!orgRow.instagram_story) {
        out.push({
          platform: 'instagram',
          placement: 'story',
          platformPostUrl: null,
          graphObjectId: null,
          skippedReason: 'Instagram Stories are turned off.',
        })
        return
      }
      try {
        const r = await publishInstagramStory(igUserId, token, mediaKind, mediaUrl)
        out.push({
          platform: 'instagram',
          placement: 'story',
          platformPostUrl: r.permalink || null,
          graphObjectId: r.graphId,
        })
      } catch (e) {
        out.push({
          platform: 'instagram',
          placement: 'story',
          platformPostUrl: null,
          graphObjectId: null,
          error: e instanceof Error ? e.message : 'Instagram story failed',
        })
      }
      return
    }
    if (!orgRow.instagram_feed) {
      out.push({
        platform: 'instagram',
        placement: 'feed',
        platformPostUrl: null,
        graphObjectId: null,
        skippedReason: 'Instagram feed posting is disabled for this dealership.',
      })
      return
    }
    try {
      const r = await publishInstagramFeed(igUserId, token, caption, mediaKind, mediaUrl)
      out.push({
        platform: 'instagram',
        placement: 'feed',
        platformPostUrl: r.permalink,
        graphObjectId: r.graphId,
      })
    } catch (e) {
      out.push({
        platform: 'instagram',
        placement: 'feed',
        platformPostUrl: null,
        graphObjectId: null,
        error: e instanceof Error ? e.message : 'Instagram post failed',
      })
    }
  }

  await Promise.all([fb(), ig()])
  return out
}
