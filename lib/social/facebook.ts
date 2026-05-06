/**
 * Facebook Graph API helpers for manual vehicle posts.
 *
 * Photo post  — posts a single branded image to a Facebook Page feed.
 * Reel        — posts a rendered vehicle video as a Facebook Reel.
 *
 * Both functions return the Graph API object ID on success.
 */

const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Post a single photo to a Facebook Page feed.
 * The image must be at a publicly reachable HTTPS URL (e.g. R2).
 * Returns the published photo/post ID.
 */
export async function postPhotoToFacebook(
  imageUrl:    string,
  caption:     string,
  pageId:      string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:          imageUrl,
      caption,
      access_token: accessToken,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    let fbMsg = `HTTP ${res.status}`
    try {
      const errBody = await res.json() as { error?: { message?: string; code?: number } }
      if (errBody.error?.message) fbMsg = errBody.error.message
    } catch { /* ignore */ }
    throw new Error(fbMsg)
  }

  const data = await res.json() as { id?: string; post_id?: string; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  const id = data.post_id ?? data.id
  if (!id) throw new Error('Facebook returned no post ID')
  return id
}

/**
 * Post a rendered video as a Facebook Reel.
 * Returns the video object ID (video is processed asynchronously by Facebook).
 */
export async function postReelToFacebook(
  videoUrl:    string,
  description: string,
  pageId:      string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url:             videoUrl,
      description,
      content_category:     'VEHICLES_AND_TRANSPORTATION',
      content_tags:         [],
      access_token:         accessToken,
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    let fbMsg = `HTTP ${res.status}`
    try {
      const errBody = await res.json() as { error?: { message?: string } }
      if (errBody.error?.message) fbMsg = errBody.error.message
    } catch { /* ignore */ }
    throw new Error(fbMsg)
  }

  const data = await res.json() as { id?: string; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  if (!data.id) throw new Error('Facebook returned no video ID')
  return data.id
}

/**
 * Post multiple photos as a single Facebook Page feed post.
 *
 * Facebook requires a two-step process for multi-photo posts:
 *  1. Upload each image as an unpublished photo → get each photo's fbid.
 *  2. Create a feed post that attaches all photo fbids.
 *
 * Falls back to the single-photo endpoint when only one image is provided.
 * Returns the published post/photo ID.
 */
export async function postMultiplePhotosToFacebook(
  imageUrls:   string[],
  caption:     string,
  pageId:      string,
  accessToken: string,
): Promise<string> {
  if (imageUrls.length === 0) throw new Error('At least one photo is required')

  // Single photo — simpler direct upload with caption
  if (imageUrls.length === 1) {
    return postPhotoToFacebook(imageUrls[0], caption, pageId, accessToken)
  }

  // Step 1: Upload each photo as unpublished to get its fbid
  const fbids = await Promise.all(
    imageUrls.map(async (url) => {
      const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url, published: false, access_token: accessToken }),
        signal:  AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        let fbMsg = `HTTP ${res.status}`
        try {
          const errBody = await res.json() as { error?: { message?: string } }
          if (errBody.error?.message) fbMsg = errBody.error.message
        } catch { /* ignore */ }
        throw new Error(fbMsg)
      }
      const data = await res.json() as { id?: string; error?: { message: string } }
      if (data.error) throw new Error(data.error.message)
      if (!data.id)   throw new Error('Facebook returned no photo ID during staged upload')
      return data.id
    }),
  )

  // Step 2: Create a single feed post that attaches all photos
  const attached_media = fbids.map(id => ({ media_fbid: id }))
  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message: caption, attached_media, access_token: accessToken }),
    signal:  AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    let fbMsg = `HTTP ${res.status}`
    try {
      const errBody = await res.json() as { error?: { message?: string } }
      if (errBody.error?.message) fbMsg = errBody.error.message
    } catch { /* ignore */ }
    throw new Error(fbMsg)
  }

  const data = await res.json() as { id?: string; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  if (!data.id)   throw new Error('Facebook returned no post ID')
  return data.id
}

export function buildFacebookPostUrl(pageId: string, postId: string): string {
  // Graph post IDs are typically `{pageId}_{objectId}`; permalink uses the page + post
  return `https://www.facebook.com/${pageId}/posts/${postId.split('_')[1] ?? postId}`
}
