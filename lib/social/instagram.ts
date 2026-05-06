const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Post a video as an Instagram Reel (2-step: create container, then publish).
 * Returns the platform media ID on success.
 */
export async function postVideoToInstagram(
  videoUrl: string,
  caption: string,
  igAccountId: string,
  accessToken: string,
): Promise<string> {
  // Step 1: Create media container
  const containerRes = await fetch(`${GRAPH_BASE}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type:   'REELS',
      video_url:    videoUrl,
      caption,
      share_to_feed: true,
      access_token: accessToken,
    }),
  })

  if (!containerRes.ok) {
    const err = await containerRes.text()
    console.error('[instagram] Container creation failed:', containerRes.status, err.slice(0, 300))
    throw new Error(`Instagram container creation failed: ${containerRes.status}`)
  }

  const containerData = await containerRes.json() as { id?: string; error?: { message: string } }
  if (containerData.error) throw new Error(`Instagram API error: ${containerData.error.message}`)
  if (!containerData.id) throw new Error('Instagram returned no container ID')

  const containerId = containerData.id

  // Step 2: Wait for container to be ready (poll up to 60s)
  let ready = false
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    const statusRes = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    )
    if (statusRes.ok) {
      const status = await statusRes.json() as { status_code?: string }
      if (status.status_code === 'FINISHED') { ready = true; break }
      if (status.status_code === 'ERROR') throw new Error('Instagram media processing failed')
    }
  }

  if (!ready) throw new Error('Instagram media container timed out')

  // Step 3: Publish
  const publishRes = await fetch(`${GRAPH_BASE}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  })

  if (!publishRes.ok) {
    const err = await publishRes.text()
    console.error('[instagram] Publish failed:', publishRes.status, err.slice(0, 300))
    throw new Error(`Instagram publish failed: ${publishRes.status}`)
  }

  const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
  if (publishData.error) throw new Error(`Instagram publish error: ${publishData.error.message}`)
  if (!publishData.id) throw new Error('Instagram returned no media ID')

  return publishData.id
}

export function buildInstagramPostUrl(mediaId: string): string {
  return `https://www.instagram.com/p/${mediaId}/`
}

/**
 * Publish up to 10 images as an Instagram carousel post.
 *
 * Meta Graph API flow:
 *  1. Create a child media container for each image (is_carousel_item: true).
 *  2. Create a parent CAROUSEL container referencing all child IDs.
 *  3. Poll until the parent container status is FINISHED (images process fast — usually < 5 s).
 *  4. Publish the carousel via media_publish.
 *
 * Returns the published Instagram media ID.
 */
export async function publishInstagramCarousel(
  imageUrls: string[],
  caption: string,
  igAccountId: string,
  accessToken: string,
): Promise<string> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel requires 2–10 images, got ${imageUrls.length}`)
  }

  // Step 1: Create a child container for every image (parallelised — no ordering dependency)
  const childIds = await Promise.all(
    imageUrls.map(async (imageUrl, i) => {
      const res = await fetch(`${GRAPH_BASE}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url:         imageUrl,
          is_carousel_item:  true,
          access_token:      accessToken,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Carousel child ${i} creation failed (${res.status}): ${err.slice(0, 200)}`)
      }
      const data = await res.json() as { id?: string; error?: { message: string } }
      if (data.error) throw new Error(`Instagram API error (child ${i}): ${data.error.message}`)
      if (!data.id)   throw new Error(`Instagram returned no container ID for child ${i}`)
      return data.id
    }),
  )

  // Step 2: Create the parent CAROUSEL container
  const parentRes = await fetch(`${GRAPH_BASE}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type:   'CAROUSEL',
      children:     childIds.join(','),
      caption,
      access_token: accessToken,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!parentRes.ok) {
    const err = await parentRes.text()
    throw new Error(`Carousel parent creation failed (${parentRes.status}): ${err.slice(0, 200)}`)
  }

  const parentData = await parentRes.json() as { id?: string; error?: { message: string } }
  if (parentData.error) throw new Error(`Instagram API error (parent): ${parentData.error.message}`)
  if (!parentData.id)   throw new Error('Instagram returned no parent carousel container ID')

  const containerId = parentData.id

  // Step 3: Poll until FINISHED (image carousels typically finish in < 10 s)
  let ready = false
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2_500))
    const statusRes = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (statusRes.ok) {
      const status = await statusRes.json() as { status_code?: string }
      if (status.status_code === 'FINISHED') { ready = true; break }
      if (status.status_code === 'ERROR')    throw new Error('Instagram carousel container processing failed')
    }
  }

  if (!ready) throw new Error('Instagram carousel container timed out after 60 s')

  // Step 4: Publish
  const publishRes = await fetch(`${GRAPH_BASE}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!publishRes.ok) {
    const err = await publishRes.text()
    throw new Error(`Carousel publish failed (${publishRes.status}): ${err.slice(0, 200)}`)
  }

  const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
  if (publishData.error) throw new Error(`Instagram publish error: ${publishData.error.message}`)
  if (!publishData.id)   throw new Error('Instagram returned no media ID after carousel publish')

  return publishData.id
}
