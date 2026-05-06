/**
 * Instagram carousel slide composer.
 *
 * Downloads each dealer photo, applies branded overlays via Sharp + SVG compositing,
 * then uploads the finished JPEGs to R2. Returns public R2 URLs ready for the
 * Meta Graph API.
 *
 * Slide layout:
 *  - Slide 1 (hero): vehicle name + price badge overlaid on the first photo.
 *  - Slides 2…N (gallery): subtle dealer watermark bottom-right on each photo.
 *  - Final slide (end card): synthetic dark-background card with dealer name + phone + CTA.
 */

import sharp from 'sharp'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'

const SLIDE_SIZE    = 1080
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_VIDEOS ?? 'dealerwyze-videos'
const R2_PUBLIC_URL = process.env.R2_VIDEOS_PUBLIC_URL ?? ''

export interface CarouselVehicle {
  year:    number | null
  make:    string | null
  model:   string | null
  trim:    string | null
  price:   number | null
  mileage: number | null
}

export interface CarouselBranding {
  dealerName: string
  phone:      string
  city:       string
  state:      string
  website:    string
}

// ─── XML / text helpers ──────────────────────────────────────────────────────

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function fmtPrice(price: number | null): string {
  if (price == null) return 'Call for price'
  return `$${Number(price).toLocaleString('en-US')}`
}

function fmtMileage(mileage: number | null): string {
  if (mileage == null) return ''
  return `${Number(mileage).toLocaleString('en-US')} miles`
}

function buildVehicleLabel(v: CarouselVehicle): string {
  return trunc([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '), 36)
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw
}

// ─── SVG overlay builders ────────────────────────────────────────────────────

function heroOverlaySvg(v: CarouselVehicle): Buffer {
  const S         = SLIDE_SIZE
  const label     = xmlEsc(buildVehicleLabel(v))
  const price     = xmlEsc(fmtPrice(v.price))
  const mileage   = xmlEsc(fmtMileage(v.mileage))
  const gradTop   = S - 260
  const badgeX    = S - 250
  const badgeY    = S - 175
  const labelY    = S - 140
  const mileageY  = S - 82
  const priceTextY = badgeY + 48

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <linearGradient id="hg" x1="0" y1="${gradTop}" x2="0" y2="${S}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradTop}" width="${S}" height="${S - gradTop}" fill="url(#hg)"/>
  <rect x="0" y="0" width="${S}" height="${S}" fill="none" stroke="white" stroke-width="6" opacity="0.3"/>
  <text x="36" y="${labelY}" font-family="sans-serif" font-size="48" font-weight="bold" fill="white">${label}</text>
  ${mileage ? `<text x="36" y="${mileageY}" font-family="sans-serif" font-size="32" fill="rgba(255,255,255,0.82)">${mileage}</text>` : ''}
  <rect x="${badgeX}" y="${badgeY}" width="214" height="68" rx="10" fill="#F07018"/>
  <text x="${badgeX + 107}" y="${priceTextY}" font-family="sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">${price}</text>
</svg>`

  return Buffer.from(svg)
}

function galleryOverlaySvg(dealerName: string): Buffer {
  const S    = SLIDE_SIZE
  const name = xmlEsc(trunc(dealerName, 30))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <rect x="0" y="0" width="${S}" height="${S}" fill="none" stroke="white" stroke-width="6" opacity="0.22"/>
  <text x="${S - 24}" y="${S - 22}" font-family="sans-serif" font-size="23" fill="white" opacity="0.52" text-anchor="end">${name}</text>
</svg>`

  return Buffer.from(svg)
}

async function buildEndCardJpeg(branding: CarouselBranding): Promise<Buffer> {
  const S = SLIDE_SIZE

  const name    = xmlEsc(trunc(branding.dealerName, 30))
  const phone   = branding.phone   ? xmlEsc(fmtPhone(branding.phone))                           : ''
  const location = (branding.city || branding.state)
    ? xmlEsc([branding.city, branding.state].filter(Boolean).join(', '))
    : ''
  const website = branding.website
    ? xmlEsc(trunc(branding.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), 38))
    : ''

  // Vertical layout — stack items and compute Y positions
  const cx = S / 2
  const accentBarY = 300
  const nameY      = 420
  const locationY  = nameY + 70
  const dividerY   = locationY + 50
  const phoneY     = dividerY + 72
  const websiteY   = phone ? phoneY + 62 : dividerY + 72
  const ctaY       = (phone || website) ? Math.max(phoneY, websiteY) + 80 : dividerY + 120

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="${S}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0d1b2a"/>
      <stop offset="1" stop-color="#1a2f4a"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${S}" height="${S}" fill="url(#bg)"/>

  <!-- Orange accent bar -->
  <rect x="${cx - 48}" y="${accentBarY}" width="96" height="6" rx="3" fill="#F07018"/>

  <!-- Dealer name -->
  <text x="${cx}" y="${nameY}" font-family="sans-serif" font-size="62" font-weight="bold"
        fill="white" text-anchor="middle">${name}</text>

  <!-- City, State -->
  ${location ? `<text x="${cx}" y="${locationY}" font-family="sans-serif" font-size="34"
        fill="rgba(255,255,255,0.65)" text-anchor="middle">${location}</text>` : ''}

  <!-- Divider line -->
  <line x1="${cx - 160}" y1="${dividerY}" x2="${cx + 160}" y2="${dividerY}"
        stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>

  <!-- Phone -->
  ${phone ? `<text x="${cx}" y="${phoneY}" font-family="sans-serif" font-size="46" font-weight="bold"
        fill="#F07018" text-anchor="middle">${phone}</text>` : ''}

  <!-- Website -->
  ${website ? `<text x="${cx}" y="${websiteY}" font-family="sans-serif" font-size="30"
        fill="rgba(255,255,255,0.60)" text-anchor="middle">${website}</text>` : ''}

  <!-- CTA -->
  <text x="${cx}" y="${ctaY}" font-family="sans-serif" font-size="34"
        fill="rgba(255,255,255,0.75)" text-anchor="middle">Come see us today!</text>

  <!-- Orange border frame -->
  <rect x="0" y="0" width="${S}" height="${S}" fill="none" stroke="#F07018" stroke-width="8" opacity="0.30"/>
</svg>`

  return await sharp({
    create: { width: S, height: S, channels: 4, background: { r: 13, g: 27, b: 42, alpha: 1 } },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92, progressive: true })
    .toBuffer()
}

// ─── Photo download ───────────────────────────────────────────────────────────

async function downloadPhoto(url: string): Promise<Buffer> {
  assertSafeOutboundMediaUrl(url)
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Photo download failed (${res.status}): ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

// ─── R2 upload ────────────────────────────────────────────────────────────────

async function uploadSlide(key: string, jpeg: Buffer): Promise<void> {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    throw new Error('R2 credentials not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)')
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  })
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: jpeg,
    ContentType: 'image/jpeg',
  }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compose a single hero-branded JPEG from one photo and upload it to R2.
 * Used for Facebook photo posts and any other single-image social post.
 * Returns the public R2 URL.
 */
export async function composeSingleHeroSlide(params: {
  photoUrl:  string
  vehicle:   CarouselVehicle
  branding:  CarouselBranding
  orgId:     string
  vehicleId: string
}): Promise<string> {
  const { photoUrl, vehicle, orgId, vehicleId } = params
  const timestamp = Date.now()
  const key       = `social/${orgId}/${vehicleId}/${timestamp}/hero.jpg`

  const raw     = await downloadPhoto(photoUrl)
  const overlay = heroOverlaySvg(vehicle)

  const jpeg = await sharp(raw)
    .resize(SLIDE_SIZE, SLIDE_SIZE, { fit: 'cover', position: 'centre' })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 92, progressive: true })
    .toBuffer()

  await uploadSlide(key, jpeg)
  return `${R2_PUBLIC_URL}/${key}`
}

/**
 * Compose branded Facebook slides (hero + gallery overlays, no end card).
 * Slide 1 gets the price/vehicle hero overlay; slides 2…N get the dealer watermark.
 * Returns public R2 URLs in the same order as `photoUrls`.
 */
export async function composeFacebookSlides(params: {
  photoUrls: string[]
  vehicle:   CarouselVehicle
  branding:  CarouselBranding
  orgId:     string
  vehicleId: string
}): Promise<string[]> {
  const { photoUrls, vehicle, branding, orgId, vehicleId } = params
  const timestamp  = Date.now()
  const prefix     = `fb/${orgId}/${vehicleId}/${timestamp}`
  const publicUrls: string[] = []

  const photoBuffers = await Promise.all(photoUrls.map(url => downloadPhoto(url)))

  await Promise.all(
    photoBuffers.map(async (raw, idx) => {
      const overlay = idx === 0
        ? heroOverlaySvg(vehicle)
        : galleryOverlaySvg(branding.dealerName)

      const jpeg = await sharp(raw)
        .resize(SLIDE_SIZE, SLIDE_SIZE, { fit: 'cover', position: 'centre' })
        .composite([{ input: overlay, top: 0, left: 0 }])
        .jpeg({ quality: 92, progressive: true })
        .toBuffer()

      const key = `${prefix}/${idx}.jpg`
      await uploadSlide(key, jpeg)
      publicUrls[idx] = `${R2_PUBLIC_URL}/${key}`
    }),
  )

  return publicUrls
}

/**
 * Compose branded carousel slides for all `photoUrls` plus a synthetic end card.
 * Returns an array of public R2 JPEG URLs (length = photoUrls.length + 1).
 *
 * Meta Graph API accepts up to 10 carousel children; callers should pass at most 9
 * photos so the end card fits within the 10-slide limit.
 */
export async function composeCarouselSlides(params: {
  photoUrls: string[]
  vehicle:   CarouselVehicle
  branding:  CarouselBranding
  orgId:     string
  vehicleId: string
}): Promise<string[]> {
  const { photoUrls, vehicle, branding, orgId, vehicleId } = params
  const timestamp = Date.now()
  const prefix    = `carousels/${orgId}/${vehicleId}/${timestamp}`

  const publicUrls: string[] = []

  // Process each photo in parallel for speed
  const photoBuffers = await Promise.all(
    photoUrls.map(url => downloadPhoto(url)),
  )

  await Promise.all(
    photoBuffers.map(async (raw, idx) => {
      const overlay = idx === 0
        ? heroOverlaySvg(vehicle)
        : galleryOverlaySvg(branding.dealerName)

      const jpeg = await sharp(raw)
        .resize(SLIDE_SIZE, SLIDE_SIZE, { fit: 'cover', position: 'centre' })
        .composite([{ input: overlay, top: 0, left: 0 }])
        .jpeg({ quality: 92, progressive: true })
        .toBuffer()

      const key = `${prefix}/${idx}.jpg`
      await uploadSlide(key, jpeg)
      publicUrls[idx] = `${R2_PUBLIC_URL}/${key}`
    }),
  )

  // End card — always appended as the final slide
  const endCard    = await buildEndCardJpeg(branding)
  const endCardKey = `${prefix}/end.jpg`
  await uploadSlide(endCardKey, endCard)
  publicUrls.push(`${R2_PUBLIC_URL}/${endCardKey}`)

  return publicUrls
}
