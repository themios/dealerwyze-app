/**
 * POST /api/listings/scan-photo (LIST-02)
 *
 * Accepts a base64-encoded listing photo or flyer and returns AI-extracted
 * RE listing fields. Does NOT save anything to the database.
 *
 * Billing gate: uses assertCanUseFeature('ai_scan') — same gate as the
 * dealer vehicle scan-image route.
 * Returns 403 for non-real_estate org verticals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { parseListingPhoto } from '@/lib/listings/parseListingPhoto'

export const maxDuration = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Vertical guard — RE orgs only
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .single()

  if (org?.vertical !== 'real_estate') {
    return NextResponse.json(
      { error: 'Not available for this account type' },
      { status: 403 },
    )
  }

  // Billing gate — same as dealer vehicle scan-image
  try {
    await assertCanUseFeature(profile.org_id, 'ai_scan')
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    imageBase64?: string
    mimeType?: string
  }

  const { imageBase64, mimeType } = body

  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: 'Missing image' }, { status: 400 })
  }

  try {
    const extracted = await parseListingPhoto(imageBase64, mimeType)

    if (!extracted) {
      return NextResponse.json(
        {
          error:
            'Could not read listing info from the image. Try a clearer photo or paste the listing description text.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(extracted)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image scan failed'

    // Validation errors from parseListingPhoto (size, type) — 400
    if (
      message.includes('too large') ||
      message.includes('Unsupported image type')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('[listings/scan-photo] error:', message)
    return NextResponse.json({ error: 'Image scan failed' }, { status: 500 })
  }
}
