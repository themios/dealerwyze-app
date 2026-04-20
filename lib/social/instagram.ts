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
