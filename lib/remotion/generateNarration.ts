import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { VehicleVideoProps } from './types'

const R2_ACCOUNT_ID  = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET      = process.env.R2_BUCKET_VIDEOS ?? 'dealerwyze-videos'
const R2_PUBLIC_URL  = process.env.R2_VIDEOS_PUBLIC_URL ?? ''
const TTS_API_KEY    = process.env.GOOGLE_TTS_API_KEY

export function buildNarrationScript(props: VehicleVideoProps): string {
  const trimStr = props.trim ? ` ${props.trim}` : ''

  // Opener
  const opener = props.dealerCity
    ? `Just arrived at ${props.dealerName} in ${props.dealerCity}, ${props.dealerState}: the ${props.year} ${props.make} ${props.model}${trimStr}.`
    : `Check out this ${props.year} ${props.make} ${props.model}${trimStr}.`

  // Core specs — mileage, color, interior, engine
  const specs: string[] = []
  if (props.mileage && props.mileage > 0) specs.push(`${props.mileage.toLocaleString()} miles`)
  if (props.color && props.interior) specs.push(`${props.color} exterior with ${props.interior} interior`)
  else if (props.color) specs.push(`${props.color} exterior`)
  if (props.engine) specs.push(props.engine)
  const specsStr = specs.length > 0 ? specs.join(', ') + '.' : ''

  // Features — up to 4, grouped naturally
  const feats = (props.features ?? []).filter(Boolean).slice(0, 4)
  let featuresStr = ''
  if (feats.length === 1) {
    featuresStr = `This one includes ${feats[0]}.`
  } else if (feats.length === 2) {
    featuresStr = `Loaded with ${feats[0]} and ${feats[1]}.`
  } else if (feats.length >= 3) {
    const last = feats[feats.length - 1]
    const rest = feats.slice(0, -1).join(', ')
    featuresStr = `Loaded with ${rest}, and ${last}.`
  }

  // MPG
  const mpgStr = props.mpgCity && props.mpgHwy
    ? `Gets ${props.mpgCity} city and ${props.mpgHwy} highway.`
    : ''

  // Price
  const priceStr = props.price && props.price > 0
    ? `Priced to sell at $${props.price.toLocaleString()}.`
    : ''

  // Salvage note
  const salvageStr = props.isSalvage
    ? 'Salvage title vehicle, priced accordingly.'
    : ''

  // CTA
  const ctaParts: string[] = [`Come see it at ${props.dealerName}`]
  if (props.dealerCity && props.dealerState) ctaParts[0] += ` in ${props.dealerCity}, ${props.dealerState}`
  if (props.dealerPhone) ctaParts.push(`or call ${props.dealerPhone}`)
  const ctaStr = ctaParts.join(' ') + '.'
  const websiteStr = props.dealerWebsite ? `More at ${props.dealerWebsite}.` : ''

  return [opener, specsStr, featuresStr, mpgStr, priceStr, salvageStr, ctaStr, websiteStr]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function r2ObjectKey(orgId: string, vehicleId: string): string {
  return `videos/${orgId}/${vehicleId}/narration.mp3`
}

function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

/**
 * Upload a buffer to R2 using the S3-compatible API.
 * We use fetch + presigned-style PUT directly against R2's S3 endpoint.
 */
async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    throw new Error('R2 credentials not configured')
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  })

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
}

/**
 * Check if narration already exists in R2 for this vehicle.
 * Returns the public URL if it exists, null otherwise.
 */
async function checkNarrationCache(orgId: string, vehicleId: string): Promise<string | null> {
  const key = r2ObjectKey(orgId, vehicleId)
  const url = r2PublicUrl(key)
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (res.ok) return url
  } catch {
    // Not cached
  }
  return null
}

/**
 * Generate TTS narration via Google Cloud TTS, upload to R2, return public URL.
 * Caches: if narration already exists in R2 for this vehicle, returns cached URL.
 */
export async function generateVehicleNarration(
  orgId: string,
  vehicleId: string,
  props: VehicleVideoProps,
  force = false,
): Promise<string> {
  if (!TTS_API_KEY) {
    console.warn('GOOGLE_TTS_API_KEY not set — skipping narration generation')
    return ''
  }

  // Check cache first (unless forced)
  if (!force) {
    const cached = await checkNarrationCache(orgId, vehicleId)
    if (cached) return cached
  }

  const script = buildNarrationScript(props)

  // Call Google Cloud TTS REST API
  const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`
  const ttsBody = {
    input: { text: script },
    voice: {
      languageCode: 'en-US',
      name: props.narrationUrl ? undefined : 'en-US-Neural2-D', // use vehicle voice if embedded
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: -1.0,
    },
  }

  const res = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ttsBody),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google TTS failed: ${res.status} ${err.slice(0, 200)}`)
  }

  const { audioContent } = await res.json() as { audioContent: string }
  const buffer = Buffer.from(audioContent, 'base64')
  const key = r2ObjectKey(orgId, vehicleId)

  await uploadToR2(key, buffer, 'audio/mpeg')

  return r2PublicUrl(key)
}

/**
 * Generate narration with a specific voice name.
 * If `customScript` is provided it is used verbatim; otherwise the script
 * is auto-generated from vehicle props via buildNarrationScript().
 */
export async function generateVehicleNarrationWithVoice(
  orgId: string,
  vehicleId: string,
  props: VehicleVideoProps,
  voiceName: string,
  customScript?: string,
): Promise<string> {
  if (!TTS_API_KEY) return ''

  const script = customScript?.trim() || buildNarrationScript(props)
  const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`

  const res = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: script },
      voice: { languageCode: 'en-US', name: voiceName },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: -1.0 },
    }),
  })

  if (!res.ok) throw new Error(`Google TTS failed: ${res.status}`)

  const { audioContent } = await res.json() as { audioContent: string }
  const buffer = Buffer.from(audioContent, 'base64')
  const key = r2ObjectKey(orgId, vehicleId)
  await uploadToR2(key, buffer, 'audio/mpeg')
  return r2PublicUrl(key)
}
