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

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    }).catch(err => {
      clearTimeout(timeoutId)
      throw err
    })

    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`Website returned ${response.status}`)

    const html = await response.text()
    if (!html || html.length === 0) throw new Error('Website returned empty response')

    // Simple extraction: look for address patterns in the HTML
    const listings: ScrapedListing[] = []

    // Extract addresses: pattern like "1234 Street Name, City, CA 12345"
    const addressRegex = /(\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Blvd|Boulevard|Court|Ct|Place|Pl)[^,]*,\s*[^,]*,\s*CA\s*\d+)/gi
    const addresses = html.match(addressRegex) || []

    // Extract prices: $X,XXX or $X,XXX,XXX
    const priceRegex = /\$[\d,]+/g
    const prices = html.match(priceRegex) || []

    // Extract beds: "X Bed" or "X Bedroom"
    const bedsRegex = /(\d+)\s*(?:Bed|Bedroom)/gi
    const bedsMatches = html.match(bedsRegex) || []

    // Extract baths: "X Bath" or "X Bathroom"
    const bathsRegex = /(\d+(?:\.\d+)?)\s*(?:Bath|Bathroom)/gi
    const bathsMatches = html.match(bathsRegex) || []

    // Extract sqft: "X,XXX SqFt" or similar
    const sqftRegex = /(\d+(?:,\d+)?)\s*(?:SqFt|Sq\.?Ft?)/gi
    const sqftMatches = html.match(sqftRegex) || []

    // Create listings from addresses (minimum required field)
    for (let i = 0; i < addresses.length; i++) {
      listings.push({
        address: addresses[i].trim(),
        price: prices[i] ? parseInt(prices[i].replace(/[$,]/g, ''), 10) : null,
        propertyType: null,
        bedrooms: bedsMatches[i] ? parseInt(bedsMatches[i].replace(/\D/g, ''), 10) : null,
        bathrooms: bathsMatches[i] ? parseFloat(bathsMatches[i].replace(/\D/g, '') || '0') : null,
        sqft: sqftMatches[i] ? parseInt(sqftMatches[i].replace(/\D/g, ''), 10) : null,
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

    // Get org website URL from org_settings
    const { data: settings } = await supabase
      .from('org_settings')
      .select('dealer_website_url')
      .eq('org_id', profile.org_id)
      .maybeSingle()

    if (!settings?.dealer_website_url) {
      return NextResponse.json(
        { error: 'Please configure your website URL in Settings first' },
        { status: 400 }
      )
    }

    console.log('[sync-website] Scraping URL:', settings.dealer_website_url)

    // Scrape the website
    const listings = await scrapeWebsite(settings.dealer_website_url)
    console.log('[sync-website] Found listings:', listings.length)

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
    const message = err instanceof Error ? err.message : 'Unknown error'

    // 403 = website is blocking scrapers; suggest CSV import
    if (message.includes('403')) {
      return NextResponse.json(
        { error: 'Website is protected from automated access. Please use CSV import instead.' },
        { status: 400 }
      )
    }

    return apiError(err, {
      route: 'POST /api/listings/sync-website',
      action: 'sync_website_listings',
      userId: (await requireProfile().catch(() => ({ id: 'unknown' }))).id,
    })
  }
}
