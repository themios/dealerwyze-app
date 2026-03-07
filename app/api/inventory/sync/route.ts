import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import type { UserRole } from '@/types/index'

export const runtime = 'nodejs'
export const maxDuration = 30

interface ScrapedVehicle {
  stock_no: string
  year: number
  make: string
  model: string
  trim?: string
  price?: number
  mileage?: number
  vin?: string
  color?: string
  listing_url?: string
}

const CAR_MAKES = [
  'Acura','Alfa Romeo','Audi','BMW','Buick','Cadillac','Chevrolet','Chevy',
  'Chrysler','Dodge','Ferrari','Fiat','Ford','Genesis','GMC','Honda',
  'Hyundai','Infiniti','Jaguar','Jeep','Kia','Land Rover','Lexus','Lincoln',
  'Maserati','Mazda','Mercedes','Mitsubishi','Nissan','Pontiac','Porsche',
  'Ram','Subaru','Tesla','Toyota','Volkswagen','Volvo',
]

function tryJsonLd(html: string): ScrapedVehicle[] {
  const results: ScrapedVehicle[] = []
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      const items: any[] = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] === 'Car' || item['@type'] === 'Vehicle') {
          const name: string = item.name || ''
          const yearMatch = name.match(/^((?:19|20)\d{2})/)
          if (!yearMatch) continue
          const year = parseInt(yearMatch[1])
          const parts = name.split(' ')
          results.push({
            stock_no: item.sku || item.productID || `web-${year}-${parts[1]}-${parts.slice(2).join('-')}`.toLowerCase(),
            year,
            make: item.brand?.name || parts[1] || '',
            model: parts.slice(2).join(' '),
            price: item.offers?.price ? parseFloat(item.offers.price) : undefined,
            vin: item.vehicleIdentificationNumber,
            mileage: item.mileageFromOdometer?.value ? parseInt(item.mileageFromOdometer.value) : undefined,
            color: item.color,
          })
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return results
}

function tryEmbeddedJson(html: string): ScrapedVehicle[] {
  const patterns = [
    /window\.__INVENTORY__\s*=\s*(\[[\s\S]*?\]);/,
    /window\.__VEHICLES__\s*=\s*(\[[\s\S]*?\]);/,
    /"inventory"\s*:\s*(\[[\s\S]{10,}?\])/,
    /"vehicles"\s*:\s*(\[[\s\S]{10,}?\])/,
    /inventoryData\s*=\s*(\[[\s\S]*?\]);/,
  ]
  for (const pat of patterns) {
    const m = html.match(pat)
    if (!m) continue
    try {
      const arr = JSON.parse(m[1])
      if (!Array.isArray(arr) || arr.length === 0) continue
      const mapped: ScrapedVehicle[] = arr
        .map((v: any) => ({
          stock_no: v.stock_no || v.stockNo || v.stock || v.id || '',
          year: parseInt(v.year || v.modelYear || 0),
          make: v.make || v.Make || '',
          model: v.model || v.Model || '',
          trim: v.trim || v.Trim || undefined,
          price: v.price || v.listPrice ? parseFloat(v.price || v.listPrice) : undefined,
          mileage: v.mileage || v.miles ? parseInt(v.mileage || v.miles) : undefined,
          vin: v.vin || v.VIN || undefined,
          color: v.color || v.exteriorColor || undefined,
        }))
        .filter((v: ScrapedVehicle) => v.year > 1990 && v.make && v.model)
      if (mapped.length > 0) return mapped
    } catch { /* skip */ }
  }
  return []
}

function tryHtmlRegex(html: string): ScrapedVehicle[] {
  const results: ScrapedVehicle[] = []
  const makesPattern = CAR_MAKES.join('|')
  const titleRe = new RegExp(
    `\\b(((?:19|20)\\d{2}))\\s+(${makesPattern})\\s+([A-Za-z0-9][A-Za-z0-9-]*)`,
    'gi'
  )
  const seen = new Set<string>()
  let match
  while ((match = titleRe.exec(html)) !== null) {
    const year = parseInt(match[1])
    const make = match[3]
    const model = match[4]
    const key = `${year}-${make}-${model}`.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        stock_no: `web-${key.replace(/\s+/g, '-')}`,
        year,
        make,
        model,
      })
    }
  }
  return results
}

function extractVehicleLinks(html: string, baseUrl: string): Map<string, string> {
  // Match hrefs like /details/used-2024-honda-hr-v/123456789
  const linkRe = /href="(\/details\/(?:used|new|certified)-(\d{4})-([a-z0-9][a-z0-9-]*)\/(\d+))"/gi
  const result = new Map<string, string>()
  let m
  while ((m = linkRe.exec(html)) !== null) {
    const [, path, year, makeModelSlug] = m
    // Key: "2024-honda-hr-v" — matches how we'll key vehicles
    const key = `${year}-${makeModelSlug}`
    if (!result.has(key)) {
      result.set(key, `${baseUrl}${path}`)
    }
  }
  return result
}

/** Build lookup key from vehicle fields to match against URL slug */
function vehicleLinkKey(v: ScrapedVehicle): string {
  const make = v.make.toLowerCase().replace(/\s+/g, '-')
  const model = v.model.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return `${v.year}-${make}-${model}`
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = await createClient()

  // Fetch dealer website URL from org_settings
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('dealer_website_url, dealer_website_inventory_path')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const baseUrl       = orgSettings?.dealer_website_url?.replace(/\/$/, '') ?? ''
  const inventoryPath = orgSettings?.dealer_website_inventory_path ?? '/cars-for-sale'

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Dealer website is missing. Please add it in Settings → Organization.' },
      { status: 400 },
    )
  }

  // Fetch website HTML
  let html = ''
  try {
    const res = await fetch(`${baseUrl}${inventoryPath}`, {
      headers: { 'User-Agent': 'DealerWyze/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch website: ${err.message}` }, { status: 502 })
  }

  // Try parsing strategies in order of reliability
  let scraped: ScrapedVehicle[] = tryJsonLd(html)
  if (scraped.length === 0) scraped = tryEmbeddedJson(html)
  if (scraped.length === 0) scraped = tryHtmlRegex(html)

  // Enrich scraped vehicles with listing URLs from page links
  const vehicleLinks = extractVehicleLinks(html, baseUrl)
  for (const v of scraped) {
    if (!v.listing_url) {
      v.listing_url = vehicleLinks.get(vehicleLinkKey(v))
    }
  }

  if (scraped.length === 0) {
    return NextResponse.json({
      error: 'No vehicles found on website. The page may use JavaScript rendering.',
      html_length: html.length,
    }, { status: 422 })
  }

  // Deduplicate by stock_no
  const scrapedByKey = new Map<string, ScrapedVehicle>()
  for (const v of scraped) {
    if (v.stock_no && !scrapedByKey.has(v.stock_no)) {
      scrapedByKey.set(v.stock_no, v)
    }
  }

  // Load existing available vehicles
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, stock_no')
    .eq('user_id', profile.org_id)
    .eq('status', 'available')

  const existingMap = new Map((existing || []).map(v => [v.stock_no, v]))
  const scrapedKeys = new Set(scrapedByKey.keys())

  let added = 0
  let archived = 0

  // Insert new vehicles
  const toAdd = [...scrapedByKey.values()].filter(v => !existingMap.has(v.stock_no))
  if (toAdd.length > 0) {
    const { error } = await supabase.from('vehicles').insert(
      toAdd.map(v => ({
        user_id: profile.org_id,
        stock_no: v.stock_no,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim ?? null,
        price: v.price ?? null,
        mileage: v.mileage ?? null,
        vin: v.vin ?? null,
        color: v.color ?? null,
        listing_url: v.listing_url ?? null,
        status: 'available',
      }))
    )
    if (!error) added = toAdd.length
  }

  // Update listing_url on existing vehicles from scraped data (so email {link} uses actual car page)
  for (const v of (existing || [])) {
    const scraped = scrapedByKey.get(v.stock_no)
    if (scraped?.listing_url) {
      await supabase
        .from('vehicles')
        .update({ listing_url: scraped.listing_url })
        .eq('id', v.id)
    }
  }

  // Archive vehicles no longer on website (only available ones — don't touch sold/pending)
  const toArchive = (existing || []).filter(v => !scrapedKeys.has(v.stock_no))
  for (const v of toArchive) {
    const { data: full } = await supabase.from('vehicles').select('*').eq('id', v.id).single()
    if (full) {
      await supabase.from('vehicles_archive').insert({
        original_id: v.id,
        user_id: profile.org_id,
        data: full,
        archive_reason: 'removed_from_website',
      })
      await supabase.from('vehicles').delete().eq('id', v.id)
      archived++
    }
  }

  return NextResponse.json({ scraped: scrapedByKey.size, added, archived })
}
