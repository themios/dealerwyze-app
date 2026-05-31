import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { getAiClient, AI_MODEL, imageBlock } from '@/lib/ai/client'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export const maxDuration = 30

export async function POST(req: NextRequest) {
  await requireProfile()

  const body = await req.json()
  const { imageBase64, mimeType } = body ?? {}

  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: 'Missing image' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
  }

  const bytes = Buffer.from(imageBase64, 'base64')
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
  }

  try {
    const response = await getAiClient().chat.completions.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          imageBlock(mimeType, imageBase64),
          {
            type: 'text',
            text: `Extract vehicle information from this image. Look for: VIN (17-character code), year, make, brand, model, trim level, and odometer/mileage reading. Return ONLY valid JSON with these exact keys (use null if not found): { "vin": string|null, "year": number|null, "make": string|null, "model": string|null, "trim": string|null, "mileage": number|null }. If you see a VIN, include all 17 characters exactly as shown. Do not include any text outside the JSON object.`,
          },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not read vehicle info from image' }, { status: 422 })
    }

    let extracted: Record<string, unknown>
    try {
      extracted = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Could not read vehicle info from image' }, { status: 422 })
    }

    return NextResponse.json({
      vin: extracted.vin
        ? String(extracted.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase() || null
        : null,
      year: extracted.year ? parseInt(String(extracted.year)) || null : null,
      make: extracted.make ? String(extracted.make).trim().slice(0, 60) : null,
      model: extracted.model ? String(extracted.model).trim().slice(0, 60) : null,
      trim: extracted.trim ? String(extracted.trim).trim().slice(0, 60) : null,
      mileage: extracted.mileage ? parseInt(String(extracted.mileage)) || null : null,
    })
  } catch (err) {
    console.error('[scan-image] error:', err)
    return NextResponse.json({ error: 'Image scan failed' }, { status: 500 })
  }
}
