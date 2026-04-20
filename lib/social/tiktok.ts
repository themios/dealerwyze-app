/**
 * TikTok Content Posting API v2.
 * Note: requires app approval from TikTok (2-4 week wait).
 */

export async function postVideoToTikTok(
  videoUrl: string,
  caption: string,
  accessToken: string,
): Promise<string> {
  // Step 1: Initialize upload
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:              caption.slice(0, 2200),
        privacy_level:      'PUBLIC_TO_EVERYONE',
        disable_duet:       false,
        disable_comment:    false,
        disable_stitch:     false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source:     'PULL_FROM_URL',
        video_url:  videoUrl,
      },
    }),
  })

  if (!initRes.ok) {
    const err = await initRes.text()
    console.error('[tiktok] Init failed:', initRes.status, err.slice(0, 300))
    throw new Error(`TikTok init failed: ${initRes.status}`)
  }

  const initData = await initRes.json() as {
    data?: { publish_id?: string }
    error?: { code: string; message: string }
  }

  if (initData.error && initData.error.code !== 'ok') {
    throw new Error(`TikTok API error: ${initData.error.message}`)
  }

  const publishId = initData.data?.publish_id
  if (!publishId) throw new Error('TikTok returned no publish_id')

  // Step 2: Poll for completion (up to 90s)
  for (let attempt = 0; attempt < 18; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    })
    if (statusRes.ok) {
      const status = await statusRes.json() as {
        data?: { status?: string; video_id?: string }
        error?: { code: string; message: string }
      }
      if (status.data?.status === 'PUBLISH_COMPLETE') {
        return status.data.video_id ?? publishId
      }
      if (status.data?.status === 'FAILED') {
        throw new Error('TikTok publish failed')
      }
    }
  }

  // Return publish_id even if polling timed out
  return publishId
}

export function buildTikTokPostUrl(videoId: string): string {
  return `https://www.tiktok.com/@/video/${videoId}`
}
