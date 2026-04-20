const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Post a video to a Facebook Page.
 * Returns the platform post ID on success.
 * Logs errors and throws so caller can catch and record error_message.
 */
export async function postVideoToFacebook(
  videoUrl: string,
  caption: string,
  pageId: string,
  accessToken: string,
): Promise<string> {
  // Step 1: Initiate resumable upload session
  const initRes = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url:          videoUrl,
      description:       caption,
      access_token:      accessToken,
      published:         true,
    }),
  })

  if (!initRes.ok) {
    const err = await initRes.text()
    console.error('[facebook] Post failed:', initRes.status, err.slice(0, 300))
    throw new Error(`Facebook post failed: ${initRes.status}`)
  }

  const result = await initRes.json() as { id?: string; error?: { message: string } }
  if (result.error) throw new Error(`Facebook API error: ${result.error.message}`)
  if (!result.id) throw new Error('Facebook returned no post ID')

  return result.id
}

/**
 * Build the public URL for a Facebook post.
 */
export function buildFacebookPostUrl(pageId: string, postId: string): string {
  return `https://www.facebook.com/${pageId}/videos/${postId}`
}
