import 'server-only'
import type { ContentReelProps } from '@/lib/remotion/types'

interface NarrationResult {
  url: string   // publicly accessible URL for Remotion to fetch
  durationMs: number
}

// Builds a natural narration script from the slide content
function buildNarrationScript(props: ContentReelProps): string {
  const lines: string[] = []

  lines.push(`${props.topic}.`)
  if (props.tagline) lines.push(`${props.tagline}.`)

  for (const slide of props.slides.slice(0, 6)) {
    lines.push(slide.headline + '.')
    if (slide.body) lines.push(slide.body)
  }

  lines.push(props.ctaText + '.')

  return lines.join(' ')
}

// Calls Google Cloud TTS and uploads the audio to R2, returns the public URL
export async function generateContentNarration(
  props: ContentReelProps,
  renderId: string,
): Promise<NarrationResult | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) {
    console.warn('[generateContentNarration] GOOGLE_TTS_API_KEY not set — skipping narration')
    return null
  }

  const script = buildNarrationScript(props)

  // Google Cloud TTS REST endpoint
  const ttsResponse = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: script },
        voice: {
          languageCode: 'en-US',
          name:         'en-US-Studio-O',
        },
        audioConfig: {
          audioEncoding:   'MP3',
          speakingRate:    1.0,
          pitch:           0,
          volumeGainDb:    0,
          effectsProfileId: ['headphone-class-device'],
        },
      }),
    },
  )

  if (!ttsResponse.ok) {
    const errText = await ttsResponse.text()
    console.error('[generateContentNarration] TTS API error:', errText)
    return null
  }

  const ttsData = await ttsResponse.json() as { audioContent: string }
  const audioBytes = Buffer.from(ttsData.audioContent, 'base64')

  // Upload to R2 using AWS SDK (S3-compatible)
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY
  const r2Bucket    = process.env.R2_BUCKET_VIDEOS ?? 'dealerwyze-videos'
  const r2PublicUrl = process.env.R2_VIDEOS_PUBLIC_URL

  if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2PublicUrl) {
    console.warn('[generateContentNarration] R2 not configured — skipping narration upload')
    return null
  }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
  })

  const objectKey = `narration/${renderId}.mp3`

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      r2Bucket,
      Key:         objectKey,
      Body:        audioBytes,
      ContentType: 'audio/mpeg',
    }))
  } catch (err) {
    console.error('[generateContentNarration] R2 upload error:', err)
    return null
  }

  const publicUrl = `${r2PublicUrl}/${objectKey}`
  // Studio-O speaks at ~160 WPM; add 4s buffer so video never cuts audio off
  const wordCount = script.split(/\s+/).length
  const durationMs = Math.round((wordCount / 160) * 60_000) + 4_000

  return { url: publicUrl, durationMs }
}
