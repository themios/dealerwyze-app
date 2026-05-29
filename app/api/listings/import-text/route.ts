/**
 * POST /api/listings/import-text (LIST-01 Realtor.com fallback)
 *
 * Accepts pasted listing description text and returns AI-extracted RE listing
 * fields. Primary path for Realtor.com listings (where URL scraping is
 * unavailable) and a fallback for any other text source.
 *
 * Does NOT save anything to the database — the client merges the returned
 * fields into the new listing confirmation form.
 *
 * No billing gate — text parsing uses Claude Haiku at negligible cost.
 * Returns 403 for non-real_estate org verticals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { parseListingText } from '@/lib/listings/parseListingText'

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

  const body = await req.json().catch(() => ({})) as { text?: string }
  const { text } = body

  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return NextResponse.json(
      { error: 'Paste at least a few lines of listing description text.' },
      { status: 400 },
    )
  }

  try {
    const extracted = await parseListingText(text)

    if (!extracted) {
      return NextResponse.json(
        {
          error:
            'Could not extract listing details from the text. Try pasting more of the listing description.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(extracted)
  } catch (err) {
    console.error('[listings/import-text] error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Text extraction failed. Try again or enter the listing details manually.' },
      { status: 500 },
    )
  }
}
