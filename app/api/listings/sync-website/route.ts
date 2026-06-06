/**
 * POST /api/listings/sync-website
 * Scrape listings from org's website URL and import them.
 * RE-only endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errorHandler'

interface ScrapedListing {
  address: string
  price: number | null
  propertyType: string | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
}

async function scrapeWebsite(url: string): Promise<ScrapedListing[]> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    // Fetch with user-agent to bypass basic bot detection
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`Website returned ${response.status}`)

    const html = await response.text()

    // Parse listing cards - look for price, address, beds/baths, sqft patterns
    const listings: ScrapedListing[] = []

    // Pattern: $X,XXX,XXX or $X,XXX
    const priceRegex = /\$[\d,]+/g
    const addressRegex = /\d+[\w\s,]+(?:CA|California)/gi
    const bedsRegex = /(\d+)\s*(?:Beds?|Bedroom)/gi
    const bathsRegex = /(\d+(?:\.\d+)?)\s*(?:Baths?|Bathroom)/gi
    const sqftRegex = /(\d+(?:,\d+)?)\s*(?:SqFt|Square|Sq\.ft)/gi

    // Simple extraction: split by property cards
    const cardPattern =
      /(?:Single Family|Farm|Condo|Commercial|Lot|Manufactured|Mobile Home)[^$]*?\$[\d,]+[^$]*?(?=(?:Single Family|Farm|Condo|Commercial|Lot|Manufactured|Mobile Home|$))/gi

    const matches = html.matchAll(cardPattern)

    for (const match of matches) {
      const cardText = match[0]

      // Extract price
      const priceMatch = cardText.match(/\$[\d,]+/)
      const price = priceMatch ? parseInt(priceMatch[0].replace(/[$,]/g, ''), 10) : null

      // Extract address (look for pattern with street number and CA/California)
      const addressMatch = cardText.match(
        /(\d+[^$]*(?:Avenue|Street|Road|Drive|Lane|Way|Blvd|Circle|Dr|Ave|St|Rd|Ln|Way|Pl|Court|Ct|Terr|Ter)[^$]*?(?:CA|California))/i
      )
      const address = addressMatch ? addressMatch[1].trim() : null

      if (!address) continue

      // Extract property type
      const typeMatch = cardText.match(/(?:Single Family|Farm|Condo|Commercial|Lot|Manufactured|Mobile Home)/i)
      const propertyType = typeMatch ? typeMatch[0] : null

      // Extract beds
      const bedsMatch = cardText.match(/(\d+)\s*(?:Beds?|Bedroom)/)
      const bedrooms = bedsMatch ? parseInt(bedsMatch[1], 10) : null

      // Extract baths
      const bathsMatch = cardText.match(/(\d+(?:\.\d+)?)\s*(?:Baths?|Bathroom)/)
      const bathrooms = bathsMatch ? parseFloat(bathsMatch[1]) : null

      // Extract sqft
      const sqftMatch = cardText.match(/(\d+(?:,\d+)?)\s*(?:SqFt|Square|Sq\.ft)/)
      const sqft = sqftMatch ? parseInt(sqftMatch[1].replace(',', ''), 10) : null

      listings.push({
        address,
        price,
        propertyType,
        bedrooms,
        bathrooms,
        sqft,
      })
    }

    return listings
  } catch (err) {
    throw new Error(`Failed to scrape website: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Verify org is real_estate vertical
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical, website_url')
      .eq('id', profile.org_id)
      .maybeSingle()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json(
        { error: 'Website sync is only available for real estate organizations' },
        { status: 403 }
      )
    }

    if (!org.website_url) {
      return NextResponse.json(
        { error: 'Please configure your website URL in Settings first' },
        { status: 400 }
      )
    }

    // Scrape the website
    const listings = await scrapeWebsite(org.website_url)

    if (listings.length === 0) {
      return NextResponse.json({
        synced: 0,
        message: 'No listings found on website. Check the URL is correct.',
      })
    }

    let synced = 0

    // Insert each listing as a vehicle with RE format
    for (const listing of listings) {
      const { error } = await supabase.from('vehicles').insert({
        user_id: profile.org_id,
        year: 0, // RE marker
        make: 'RE', // RE marker
        model: listing.address.slice(0, 100), // Address in model field
        address_line1: listing.address,
        price: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        status: 'available',
        notes: listing.propertyType ? `Type: ${listing.propertyType}` : null,
        stock_no: `WEB-${Date.now().toString().slice(-6)}`,
      })

      if (!error) synced++
    }

    return NextResponse.json({
      synced,
      message: `Successfully synced ${synced} of ${listings.length} listings`,
    })
  } catch (err) {
    return apiError(err, {
      route: 'POST /api/listings/sync-website',
      action: 'sync_website_listings',
      userId: (await requireProfile().catch(() => ({ id: 'unknown' }))).id,
    })
  }
}
