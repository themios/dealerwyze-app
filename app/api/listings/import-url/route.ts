/**
 * POST /api/listings/import-url (LIST-01)
 *
 * Accepts a Zillow or Redfin listing URL, calls the Apify scraper, and returns
 * extracted RE listing fields. Does NOT save anything to the database — the
 * client merges the returned fields into the new listing confirmation form.
 *
 * Returns 400 for Realtor.com URLs with guidance to use paste-text instead.
 * Returns 503 if APIFY_API_TOKEN is not configured.
 * Returns 403 for non-real_estate org verticals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { scrapeListingUrl } from '@/lib/listings/apifyScrape'

// Apify cold starts can take 20-30s; allow up to 60s for the full round-trip
export const maxDuration = 60

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

  const body = await req.json().catch(() => ({})) as { url?: string }
  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Reject Realtor.com with actionable guidance
  if (url.includes('realtor.com')) {
    return NextResponse.json(
      {
        error:
          'Realtor.com listings cannot be imported via URL. Copy the listing description text and use Paste Listing Text instead.',
      },
      { status: 400 },
    )
  }

  // Only Zillow and Redfin are supported for URL scraping
  const supported = ['zillow.com', 'redfin.com']
  const isSupported = supported.some(d => url.includes(d))
  if (!isSupported) {
    return NextResponse.json(
      {
        error:
          'Paste a Zillow or Redfin listing URL. For Realtor.com, copy and paste the listing description text instead.',
      },
      { status: 400 },
    )
  }

  // Validate URL structure
  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
  }

  try {
    const extracted = await scrapeListingUrl(url)

    if (!extracted) {
      return NextResponse.json(
        {
          error:
            'Listing not found at that URL — it may have been removed or the URL format is not supported.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(extracted)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed'

    // APIFY_API_TOKEN missing — degrade gracefully with 503
    if (
      message.includes('not configured') ||
      message.includes('paste the listing')
    ) {
      return NextResponse.json({ error: message }, { status: 503 })
    }

    // Generic failure — use the user-friendly re-thrown message from scrapeListingUrl
    console.error('[listings/import-url] scrape error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
