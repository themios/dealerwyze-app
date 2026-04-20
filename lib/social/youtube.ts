/**
 * YouTube Data API v3 video upload via URL reference.
 * Uses resumable upload with video URL.
 */
export async function uploadVideoToYouTube(
  videoUrl: string,
  title: string,
  description: string,
  accessToken: string,
): Promise<string> {
  // Step 1: Fetch the video from R2 to get its content
  // YouTube requires a direct upload (binary) — we stream the video through our server.
  // For scale, use the YouTube resumable upload API with the video fetched from R2.
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video from R2: ${videoRes.status}`)

  const videoBuffer  = await videoRes.arrayBuffer()
  const contentType  = videoRes.headers.get('content-type') ?? 'video/mp4'
  const contentLength = videoBuffer.byteLength

  // Step 2: Initiate resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${accessToken}`,
        'Content-Type':    'application/json',
        'X-Upload-Content-Type':   contentType,
        'X-Upload-Content-Length': String(contentLength),
      },
      body: JSON.stringify({
        snippet: {
          title:       title.slice(0, 100),
          description: description.slice(0, 5000),
          tags:        ['used cars', 'car dealer', 'auto', 'dealerwyze'],
          categoryId:  '2', // Autos & Vehicles
        },
        status: {
          privacyStatus:          'public',
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  )

  if (!initRes.ok) {
    const err = await initRes.text()
    console.error('[youtube] Resumable upload init failed:', initRes.status, err.slice(0, 300))
    throw new Error(`YouTube upload init failed: ${initRes.status}`)
  }

  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube did not return upload URL')

  // Step 3: Upload video content
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type':   contentType,
      'Content-Length': String(contentLength),
    },
    body: videoBuffer,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error('[youtube] Video upload failed:', uploadRes.status, err.slice(0, 300))
    throw new Error(`YouTube video upload failed: ${uploadRes.status}`)
  }

  const result = await uploadRes.json() as { id?: string; error?: { message: string } }
  if (result.error) throw new Error(`YouTube API error: ${result.error.message}`)
  if (!result.id) throw new Error('YouTube returned no video ID')

  return result.id
}

export function buildYouTubePostUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
