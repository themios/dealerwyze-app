#!/usr/bin/env node
// Fetch a vehicle detail page and extract data + photos into preview-props.json
// Usage:
//   node scripts/fetch-vehicle.mjs https://www.cargurus.com/details/437049310
//   node scripts/fetch-vehicle.mjs https://www.apolloauto-em.com/details/used-2024-honda-hr-v/116797259

import { writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const PROPS_FILE = resolve(__dir, '../remotion/preview-props.json')

const url = process.argv[2]
if (!url) {
  console.error('Usage: node scripts/fetch-vehicle.mjs <url>')
  process.exit(1)
}

console.log(`\nFetching: ${url}`)

// For CarGurus: extract structured data directly via Playwright JS evaluation
async function fetchCarGurusData(url) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Brief wait for Remix hydration to populate __remixContext
  await page.waitForFunction(() => !!window.__remixContext?.state?.loaderData?.['routes/($intl).details.$listingId'], { timeout: 15000 }).catch(() => {})

  const data = await page.evaluate(() => {
    const vdpData = window.__remixContext?.state?.loaderData?.['routes/($intl).details.$listingId']?.data
    return vdpData ?? null
  })

  await browser.close()
  return data
}

async function fetchHtml(url) {
  // Try plain fetch first (fast path)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Upgrade-Insecure-Requests': '1',
      },
    })
    if (res.ok) return await res.text()
    console.log(`  Plain fetch blocked (HTTP ${res.status}), trying headless browser...`)
  } catch { /* fall through */ }

  // Fall back to headless browser HTML
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const html = await page.content()
  await browser.close()
  return html
}

// Detect CarGurus URL and use direct JS extraction
const isCarGurus = /cargurus\.com/i.test(url)
let html = null
let directCgData = null

if (isCarGurus) {
  console.log('  Detected CarGurus — using headless browser...')
  directCgData = await fetchCarGurusData(url)
} else {
  html = await fetchHtml(url)
}

// ── 1. CarGurus extraction from evaluated JS data object ─────────────────────
function parseCarGurusData(vdpData) {
  const listing = vdpData?.listing
  const seller  = vdpData?.seller
  if (!listing) return null

  console.log('Found CarGurus structured data')

  const makeModel = listing.ontology || {}

  // Photos: listing.pictures — use fullSizeUrl or url, skip thumbnails (no query params = real photos)
  const photos = (listing.pictures || [])
    .map(p => p.fullSizeUrl || p.large?.url || (p.url?.includes('?') ? '' : p.url) || '')
    .filter(u => u && !u.includes('width='))
    .slice(0, 8)

  // Features: listing.options [{label, category}] — prefer non-trivial labels
  const features = (listing.options || [])
    .map(o => o.label)
    .filter(Boolean)
    .slice(0, 6)

  return {
    year:        listing.carYear,
    make:        makeModel.make?.name  || listing.make?.name,
    model:       makeModel.model?.name || listing.model?.name,
    trim:        makeModel.trim?.name  || listing.trim?.name,
    price:       listing.price?.current || 0,
    mileage:     listing.mileage?.value || 0,
    color:       listing.color?.exteriorColor?.name || listing.exteriorColorName,
    interior:    listing.color?.interiorColor?.name || listing.interiorColorName,
    engine:      listing.engine?.displayName,
    mpgCity:     listing.fuelEconomy?.city,
    mpgHwy:      listing.fuelEconomy?.highway,
    vin:         listing.vin?.value || listing.vin,
    description: listing.description || undefined,
    photos,
    features,
    dealerName:  seller?.name,
    dealerCity:  seller?.address?.city,
    dealerState: seller?.address?.region,
    dealerPhone: seller?.phoneNumberString,
  }
}

// ── 1b. Parse CarGurus remixContext from raw HTML (fallback) ─────────────────
function extractCarGurusFromHtml(html) {
  const m = html.match(/window\.__remixContext\s*=\s*(\{[\s\S]*?)\s*<\/script>/i)
  if (!m) return null
  try {
    // The JSON ends before </script> but may have a trailing semicolon
    const raw = m[1].replace(/;\s*$/, '')
    return JSON.parse(raw)?.state?.loaderData?.['routes/($intl).details.$listingId']?.data ?? null
  } catch { return null }
}

// ── 2. Try JSON-LD structured data (other dealer sites) ──────────────────────
function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const m of matches) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] === 'Car' || item['@type'] === 'Vehicle' || item['@type'] === 'Product') {
          return item
        }
      }
    } catch { /* skip */ }
  }
  return null
}

// ── 3. Extract meta tags ───────────────────────────────────────────────────────
function meta(html, name) {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'))
  return m ? m[1].trim() : null
}

// ── 4. Extract all image URLs (generic fallback) ───────────────────────────────
function extractPhotos(html) {
  const seen = new Set()
  const photos = []

  const patterns = [
    /"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"(?=[^}]*(?:photo|image|gallery|vehicle|inventory))/gi,
    /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi,
    /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi,
    /data-lazy=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi,
  ]

  for (const pattern of patterns) {
    for (const m of html.matchAll(pattern)) {
      const raw = m[1]
      try {
        const imgUrl = new URL(raw).href
        if (seen.has(imgUrl)) continue
        if (/logo|icon|badge|banner|sprite|pixel|track|avatar|placeholder|spacer|arrow|chevron/i.test(imgUrl)) continue
        seen.add(imgUrl)
        photos.push(imgUrl)
      } catch { /* skip */ }
    }
  }

  const scored = photos.map(u => {
    const m = u.match(/(\d{3,4})x(\d{3,4})/i)
    const score = m ? parseInt(m[1]) * parseInt(m[2]) : 0
    return { url: u, score }
  }).sort((a, b) => b.score - a.score)

  const unique = [...new Map(scored.map(x => [x.url, x])).values()]
  return unique.map(x => x.url).slice(0, 8)
}

// ── 5. Parse price ─────────────────────────────────────────────────────────────
function parsePrice(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^0-9]/g, '')) || 0
}

// ── 6. Parse mileage ──────────────────────────────────────────────────────────
function parseMileage(html) {
  const patterns = [
    /(\d{1,3}(?:,\d{3})*)\s*(?:miles?|mi\.?)\b/gi,
    /"mileage"\s*:\s*(\d+)/gi,
    /mileage[^>]*>[\s\n]*(\d{1,3}(?:,\d{3})*)/gi,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) {
      const val = parseInt(m[0].replace(/[^0-9]/g, ''))
      if (val > 100 && val < 500000) return val
    }
  }
  return 0
}

// ── 7. Parse year/make/model from title ────────────────────────────────────────
function parseFromTitle(str) {
  if (!str) return {}
  const m = str.match(/(?:new|used|certified)?\s*(\d{4})\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s+([A-Z][A-Za-z0-9\-]+(?:\s[A-Za-z0-9]+)?)/i)
  if (m) return { year: parseInt(m[1]), make: m[2], model: m[3].trim() }
  return {}
}

// ── Run extraction ──────────────────────────────────────────────────────────────
let existing = {}
try { existing = JSON.parse(readFileSync(PROPS_FILE, 'utf8')) } catch { /* use defaults */ }

// Use direct CarGurus data if available, else try parsing HTML
const cgData = directCgData ? parseCarGurusData(directCgData) : (html ? parseCarGurusData(extractCarGurusFromHtml(html)) : null)

let vehicle = {}
let photos = []
let dealerOverrides = {}

if (cgData) {
  // CarGurus: full data available
  vehicle = {
    year:     cgData.year,
    make:     cgData.make,
    model:    cgData.model,
    trim:     cgData.trim,
    price:    cgData.price,
    mileage:  cgData.mileage,
    color:    cgData.color,
    interior: cgData.interior,
    engine:   cgData.engine,
    mpgCity:  cgData.mpgCity,
    mpgHwy:   cgData.mpgHwy,
    vin:      cgData.vin,
  }
  photos = cgData.photos
  if (cgData.dealerName) {
    dealerOverrides = {
      dealerName:  cgData.dealerName,
      dealerCity:  cgData.dealerCity,
      dealerState: cgData.dealerState,
      dealerPhone: cgData.dealerPhone,
    }
  }
} else {
  // Generic: JSON-LD + meta tags + HTML scraping
  const jsonLd = extractJsonLd(html)
  const ogTitle = meta(html, 'og:title') || meta(html, 'title') || ''
  const ogPrice = meta(html, 'product:price:amount') || meta(html, 'og:price:amount')
  const ogImage = meta(html, 'og:image')

  if (jsonLd) {
    console.log('Found JSON-LD structured data')
    vehicle = {
      year:        parseInt(jsonLd.modelDate || jsonLd.vehicleModelDate || jsonLd.productionDate || '') || undefined,
      make:        jsonLd.brand?.name || jsonLd.manufacturer || undefined,
      model:       jsonLd.model || jsonLd.name?.split(' ').slice(2).join(' ') || undefined,
      trim:        jsonLd.vehicleConfiguration || jsonLd.trim || undefined,
      price:       parsePrice(jsonLd.offers?.price || jsonLd.price),
      mileage:     parseInt(jsonLd.mileageFromOdometer?.value || jsonLd.mileage || '') || 0,
      color:       jsonLd.color || jsonLd.vehicleInteriorColor || undefined,
      engine:      jsonLd.vehicleEngine?.engineType || undefined,
      vin:         jsonLd.vehicleIdentificationNumber || undefined,
      description: jsonLd.description || undefined,
    }
  }

  const fromTitle = parseFromTitle(ogTitle || url)
  if (!vehicle.year && fromTitle.year)   vehicle.year  = fromTitle.year
  if (!vehicle.make && fromTitle.make)   vehicle.make  = fromTitle.make
  if (!vehicle.model && fromTitle.model) vehicle.model = fromTitle.model

  const slugMatch = url.match(/(\d{4})-([a-z]+)-([a-z0-9-]+)/i)
  if (slugMatch) {
    if (!vehicle.year)  vehicle.year  = parseInt(slugMatch[1])
    if (!vehicle.make)  vehicle.make  = slugMatch[2].charAt(0).toUpperCase() + slugMatch[2].slice(1)
    if (!vehicle.model) vehicle.model = slugMatch[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  if (!vehicle.price && ogPrice) vehicle.price = parsePrice(ogPrice)
  if (!vehicle.mileage)          vehicle.mileage = parseMileage(html)

  photos = extractPhotos(html)
  if (ogImage && !photos.includes(ogImage)) photos.unshift(ogImage)
}

console.log(`Found ${photos.length} photos`)

// ── 8. Merge with existing props ───────────────────────────────────────────────
const result = {
  ...existing,
  ...dealerOverrides,            // Only override dealer fields if site provided them
  year:    vehicle.year    || existing.year    || new Date().getFullYear(),
  make:    vehicle.make    || existing.make    || 'Unknown',
  model:   vehicle.model   || existing.model   || 'Unknown',
  trim:    vehicle.trim    || existing.trim    || undefined,
  price:   vehicle.price   || existing.price   || 0,
  mileage: vehicle.mileage || existing.mileage || 0,
  color:   vehicle.color   || existing.color   || undefined,
  interior: vehicle.interior || existing.interior || undefined,
  engine:  vehicle.engine  || existing.engine  || undefined,
  mpgCity: vehicle.mpgCity || existing.mpgCity || undefined,
  mpgHwy:  vehicle.mpgHwy  || existing.mpgHwy  || undefined,
  vin:         vehicle.vin         || existing.vin         || undefined,
  description: vehicle.description || existing.description || undefined,
  photos:  photos.length > 0 ? photos : (existing.photos || []),
  // Features: use scraped if available, else keep existing
  features: (cgData?.features?.length > 0) ? cgData.features : (existing.features || []),
}

writeFileSync(PROPS_FILE, JSON.stringify(result, null, 2))

// ── 9. Print summary ──────────────────────────────────────────────────────────
console.log('\nExtracted:')
console.log(`  ${result.year} ${result.make} ${result.model}${result.trim ? ' ' + result.trim : ''}`)
console.log(`  Price:   $${(result.price || 0).toLocaleString()}`)
console.log(`  Mileage: ${(result.mileage || 0).toLocaleString()} miles`)
if (result.color)  console.log(`  Color:   ${result.color}`)
if (result.engine) console.log(`  Engine:  ${result.engine}`)
if (result.mpgCity) console.log(`  MPG:     ${result.mpgCity} city / ${result.mpgHwy} hwy`)
if (result.features?.length) console.log(`  Features: ${result.features.join(', ')}`)
console.log(`  Photos:  ${result.photos.length}`)
result.photos.forEach((p, i) => console.log(`    [${i+1}] ${p.substring(0, 80)}...`))
console.log(`\nSaved to ${PROPS_FILE}`)
console.log('\nRender with:')
console.log('  npm run video:dark')
console.log('  npm run video:bright')
console.log('  npm run video:all')
