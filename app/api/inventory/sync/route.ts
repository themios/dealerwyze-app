import { NextResponse } from 'next/server'
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

type JsonLdVehicle = {
  '@type'?: string
  name?: string
  sku?: string
  productID?: string
  vehicleIdentificationNumber?: string
  brand?: { name?: string }
  offers?: { price?: string | number } | Array<{ price?: string | number }>
  mileageFromOdometer?: { value?: string | number }
  color?: string
  image?: string | string[]
  url?: string
}

type EmbeddedInventoryVehicle = {
  stock_no?: string
  stockNo?: string
  stock?: string
  id?: string
  year?: string | number
  modelYear?: string | number
  make?: string
  Make?: string
  model?: string
  Model?: string
  trim?: string
  Trim?: string
  price?: string | number
  listPrice?: string | number
  vin?: string
  VIN?: string
  mileage?: string | number
  miles?: string | number
  color?: string
  exteriorColor?: string
  image?: string
  photo?: string
  photoUrl?: string
  url?: string
}

function parseNumericValue(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.replace(/[^0-9.]/g, '')
    if (!normalized) return undefined
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function firstOfferPrice(offers: JsonLdVehicle['offers']): number | undefined {
  if (!offers) return undefined
  const first = Array.isArray(offers) ? offers[0] : offers
  return parseNumericValue(first?.price)
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
      const items: JsonLdVehicle[] = Array.isArray(data) ? data : [data]
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
            price: firstOfferPrice(item.offers),
            vin: item.vehicleIdentificationNumber,
            mileage: parseNumericValue(item.mileageFromOdometer?.value),
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
        .map((v: EmbeddedInventoryVehicle) => ({
          stock_no: v.stock_no || v.stockNo || v.stock || v.id || '',
          year: parseInt(String(v.year || v.modelYear || 0), 10),
          make: v.make || v.Make || '',
          model: v.model || v.Model || '',
          trim: v.trim || v.Trim || undefined,
          price: parseNumericValue(v.price || v.listPrice),
          mileage: parseNumericValue(v.mileage || v.miles),
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

export async function POST() {
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

  const baseUrl = orgSettings?.dealer_website_url?.replace(/\/$/, '') ?? ''
  const path = (orgSettings?.dealer_website_inventory_path ?? '').trim()

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Add your inventory page URL in Settings → Organization (Inventory page URL) so we can sync your inventory.' },
      { status: 400 },
    )
  }

  // Single URL: when path is empty, use baseUrl as the full inventory page URL
  const fetchUrl = !path
    ? baseUrl
    : baseUrl.endsWith(path) || baseUrl.endsWith(path.replace(/^\//, ''))
      ? baseUrl
      : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  // Fetch website HTML with timeout; use full Chrome fingerprinting headers to pass bot detection
  const FETCH_TIMEOUT_MS = 25_000

  function browserHeaders(url: string): Record<string, string> {
    const origin = new URL(url).origin
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Referer': origin + '/',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    }
  }

  async function fetchHtml(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ html: string; status: number }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: browserHeaders(url),
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const text = res.ok ? await res.text() : ''
      return { html: text, status: res.status }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  let html = ''
  let fetchStatus: number | null = null
  try {
    const result = await fetchHtml(fetchUrl)
    fetchStatus = result.status
    if (result.status === 403 || result.status === 401 || result.status === 500) {
      // Try sitemap fallback — short timeout per attempt so we fail fast
      const sitemapUrl = new URL(fetchUrl).origin + '/sitemap.xml'
      try {
        const sitemapResult = await fetchHtml(sitemapUrl, 5_000)
        if (sitemapResult.status === 200 && sitemapResult.html) {
          const urlMatches = [...sitemapResult.html.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)]
          const invUrls = urlMatches
            .map(m => m[1].trim())
            .filter(u => /cars|inventory|vehicles|for-sale|stock|listings/i.test(u))
            .slice(0, 3)
          for (const u of invUrls) {
            const attempt = await fetchHtml(u, 5_000)
            if (attempt.status === 200 && attempt.html.length > 500) {
              html = attempt.html
              fetchStatus = 200
              break
            }
          }
        }
      } catch { /* sitemap fetch failed — fall through to original error */ }
    } else {
      html = result.html
    }
    if (!html) throw new Error(`HTTP ${fetchStatus ?? result.status}`)
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    let message: string
    if (isTimeout) {
      message = 'Your site took too long to respond. Try again in a few minutes or contact support if it keeps happening.'
    } else if (fetchStatus === 500) {
      message = 'Your website returned an error (500). Your web host or firewall may be blocking DealerWyze server requests. Ask your host to check their error logs for that URL.'
    } else if (fetchStatus === 403 || fetchStatus === 401) {
      message = 'Your site is blocking automated access (403 Forbidden). This is usually Cloudflare or your web host\'s bot protection. Ask your host to whitelist DealerWyze, or contact support@dealerwyze.com — we can help set up a direct inventory feed instead.'
    } else if (fetchStatus === 404) {
      message = 'Inventory page not found (404). Double-check the URL in Settings → Organization.'
    } else if (fetchStatus != null) {
      message = `Your site returned HTTP ${fetchStatus}. Check the URL in Settings → Organization and that the page is public.`
    } else {
      message = 'We couldn\'t reach your website (connection failed or timed out). Check the URL in Settings → Organization, that your site is online, and try again.'
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // Try parsing strategies in order of reliability
  let scraped: ScrapedVehicle[] = tryJsonLd(html)
  if (scraped.length === 0) scraped = tryEmbeddedJson(html)
  if (scraped.length === 0) scraped = tryHtmlRegex(html)

  // Enrich scraped vehicles with listing URLs from page links (use origin so /details/... resolves correctly)
  const linkBase = new URL(fetchUrl).origin
  const vehicleLinks = extractVehicleLinks(html, linkBase)
  for (const v of scraped) {
    if (!v.listing_url) {
      v.listing_url = vehicleLinks.get(vehicleLinkKey(v))
    }
  }

  if (scraped.length === 0) {
    return NextResponse.json({
      error: 'We couldn\'t find any vehicles on your website. Make sure your inventory page is public and the URL in Settings → Organization is correct. If your site loads inventory with JavaScript, contact support for help.',
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

  // Mark vehicles no longer on website as sync_removed — never delete automatically.
  // Dealer reviews them in Inventory and marks each as sold or restores to available.
  const toReview = (existing || []).filter(v => !scrapedKeys.has(v.stock_no))
  if (toReview.length > 0) {
    const { error: reviewError } = await supabase
      .from('vehicles')
      .update({ status: 'sync_removed', sync_removed_at: new Date().toISOString() })
      .in('id', toReview.map(v => v.id))
    if (!reviewError) archived = toReview.length
  }

  return NextResponse.json({ scraped: scrapedByKey.size, added, needs_review: archived })
}
