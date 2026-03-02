import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { scanBusinessCard } from '@/lib/contacts/vision'

export const maxDuration = 30

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * POST /api/contacts/scan
 * Body JSON: { image_base64: string, mime_type: string }
 * Returns extracted card fields — does NOT save to DB (caller confirms first).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { image_base64?: string; mime_type?: string }

  if (!body.image_base64 || !body.mime_type) {
    return NextResponse.json({ error: 'image_base64 and mime_type required' }, { status: 400 })
  }
  if (!SUPPORTED.has(body.mime_type)) {
    return NextResponse.json({ error: 'Use JPEG, PNG, or WebP' }, { status: 400 })
  }

  try {
    const extracted = await scanBusinessCard(
      body.image_base64,
      body.mime_type as 'image/jpeg' | 'image/png' | 'image/webp',
    )
    return NextResponse.json(extracted)
  } catch (err) {
    console.error('[contacts/scan] Haiku error:', err)
    return NextResponse.json({ error: 'Card scan failed — try a clearer photo' }, { status: 500 })
  }
}
