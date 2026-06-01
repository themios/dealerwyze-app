import { aiComplete, AI_MODEL } from '@/lib/ai/client'
import { z } from 'zod'

const CAR_MAKES = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chevy',
  'Chrysler', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda',
  'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln',
  'Maserati', 'Mazda', 'Mercedes', 'Mitsubishi', 'Nissan', 'Pontiac', 'Porsche',
  'Ram', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
] as const

const KNOWN_TRIMS = new Set([
  'base', 'ce', 'ex', 'gt', 'gx', 'i', 'l', 'le', 'limited', 'lx', 's', 'se', 'sel',
  'sport', 'sr', 'sv', 'touring', 'xle', 'xlt', 'xl', 'z71',
])

const AUCTION_PLATFORMS = [
  { match: /\bACV(?: Auctions)?\b/i, name: 'ACV Auctions' },
  { match: /\bOPENLANE\b/i, name: 'OPENLANE' },
  { match: /\bManheim\b/i, name: 'Manheim' },
  { match: /\bADESA\b/i, name: 'ADESA' },
  { match: /\bCopart\b/i, name: 'Copart' },
  { match: /\bIAA\b/i, name: 'IAA' },
] as const

const SYSTEM_PROMPT = `You extract structured vehicle acquisition data from pasted webpage or auction text.
Return ONLY a single raw JSON object. No markdown. No prose.`

const USER_PROMPT = `Extract the vehicle and acquisition details from this pasted text.

Return ONE JSON object with these exact keys:
{
  "vin": "string|null",
  "year": "number|null",
  "make": "string|null",
  "model": "string|null",
  "trim": "string|null",
  "mileage": "number|null",
  "color": "string|null",
  "purchase_price": "number|null",
  "purchased_at": "string|null",
  "purchased_from": "string|null",
  "acquisition_source": "auction|private|trade_in|dealer_trade|other|null",
  "auction_name": "string|null",
  "auction_lot": "string|null",
  "status": "staging|available|null",
  "notes": "string|null"
}

Rules:
- VIN must be exactly the 17-character vehicle VIN if present.
- mileage should be a whole number without commas.
- purchase_price should be the actual purchase amount paid or won bid if clearly shown.
- If the page shows multiple dollar amounts, prefer the actual transaction amount such as "Won", "Purchase", or final paid amount.
- Do NOT use estimated ranges, predictive pricing, KBB values, current bid previews, low/high forecasts, or market estimates as purchase_price.
- purchased_at must be YYYY-MM-DD if a date is present. Convert formats like MM/DD/YYYY.
- purchased_from should be the marketplace, auction house, seller, or source if present.
- acquisition_source should be "auction" for ACV, OPENLANE, Manheim, ADESA, Copart, IAA, or similar pages.
- auction_name should be the marketplace or auction house name if present.
- auction_lot should be the auction ID, lot number, or sale identifier if clearly present.
- status should be "staging" for newly acquired / auction won / purchased vehicles not yet retail-ready. Use "available" only if the pasted content clearly represents already-on-lot retail inventory.
- notes should be a concise summary of useful extra facts such as title status, seller location, drivetrain, engine, major condition flags, keys, disclosures, accidents, and damage highlights.
- If a field is not clearly present, use null.
- Do not invent values.`

const VehiclePasteSchema = z.object({
  vin: z.string().nullable(),
  year: z.number().int().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  trim: z.string().nullable(),
  mileage: z.number().int().nullable(),
  color: z.string().nullable(),
  purchase_price: z.number().nullable(),
  purchased_at: z.string().nullable(),
  purchased_from: z.string().nullable(),
  acquisition_source: z.enum(['auction', 'private', 'trade_in', 'dealer_trade', 'other']).nullable(),
  auction_name: z.string().nullable(),
  auction_lot: z.string().nullable(),
  status: z.enum(['staging', 'available']).nullable(),
  notes: z.string().nullable(),
})

export type VehiclePasteExtraction = z.infer<typeof VehiclePasteSchema>

function toSingleLine(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ')
}

function linesOf(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseInteger(value: string | null | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^0-9]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function findAuctionPlatform(text: string): string | null {
  for (const platform of AUCTION_PLATFORMS) {
    if (platform.match.test(text)) return platform.name
  }
  return null
}

function extractVin(text: string): string | null {
  const labeled = text.match(/\bVIN\b\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/i)
  if (labeled?.[1]) return labeled[1]

  const anyVin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  return anyVin?.[1] ?? null
}

function extractAuctionLot(text: string): string | null {
  const patterns = [
    /\bAuction ID\b\s*#?\s*([A-Z0-9-]{4,})\b/i,
    /\bLot(?: Number| No\.?| #)?\b\s*#?\s*([A-Z0-9-]{4,})\b/i,
    /\bSale ID\b\s*#?\s*([A-Z0-9-]{4,})\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function extractPurchasePrice(text: string): number | null {
  const patterns = [
    /\bPurchase\b[\s:$]*\$([\d,]+(?:\.\d{2})?)/i,
    /\bWon\b[\s\S]{0,40}?\$([\d,]+(?:\.\d{2})?)/i,
    /\$([\d,]+(?:\.\d{2})?)\s*\bWon\b/i,
    /\bFinal(?: Sale)? Price\b[\s:$]*\$([\d,]+(?:\.\d{2})?)/i,
    /\bSale Price\b[\s:$]*\$([\d,]+(?:\.\d{2})?)/i,
    /\bBought For\b[\s:$]*\$([\d,]+(?:\.\d{2})?)/i,
    /\bCheckout\b[\s\S]{0,60}?\$([\d,]+(?:\.\d{2})?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const amount = parseMoney(match?.[1])
    if (amount != null) return amount
  }
  return null
}

function extractPurchasedAt(text: string): string | null {
  const patterns = [
    /\bAuction Date\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /\bPurchase Date\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /\bSold On\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /\bPurchased On\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const normalized = normalizeDate(match?.[1] ?? null)
    if (normalized) return normalized
  }
  return null
}

function extractMileage(text: string): number | null {
  const patterns = [
    /\bOdometer\b\s*([0-9][0-9,]*)\b/i,
    /\b([0-9][0-9,]*)\s*Miles\b/i,
    /\b([0-9][0-9,]*)\s*miles\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const mileage = parseInteger(match?.[1])
    if (mileage != null) return mileage
  }
  return null
}

function extractColor(text: string): string | null {
  for (const line of linesOf(text)) {
    const match = line.match(/^(?:Exterior )?Color\s*[:#]?\s*([A-Za-z][A-Za-z /-]{1,30})$/i)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractTrimFromLabeledField(text: string): string | null {
  const match = text.match(/\bTrim\b\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9 .+/\-]{0,40})/i)
  return match?.[1]?.trim() || null
}

function shouldTreatAsTrim(token: string): boolean {
  const normalized = token.toLowerCase().replace(/[^a-z0-9+]/g, '')
  return normalized.length > 0 && (
    KNOWN_TRIMS.has(normalized) ||
    normalized.length <= 4 ||
    /^[a-z]{1,3}\d?$/.test(normalized) ||
    /^[a-z]{0,2}\d[a-z0-9]*$/.test(normalized)
  )
}

function titleCandidates(text: string): string[] {
  const lines = linesOf(text)
  const candidates = lines.filter(line => /^(19|20)\d{2}\s+/.test(line))
  return [...new Set(candidates)]
}

function splitYearMakeRest(line: string): { year: number; make: string; rest: string } | null {
  const yearMatch = line.match(/^((?:19|20)\d{2})\s+(.+)$/)
  if (!yearMatch) return null

  const year = Number(yearMatch[1])
  const remainder = yearMatch[2].trim()
  const lower = remainder.toLowerCase()

  for (const make of [...CAR_MAKES].sort((a, b) => b.length - a.length)) {
    const makeLower = make.toLowerCase()
    if (lower === makeLower || lower.startsWith(`${makeLower} `)) {
      return {
        year,
        make: make === 'Chevy' ? 'Chevrolet' : make,
        rest: remainder.slice(make.length).trim(),
      }
    }
  }

  return null
}

function parseVehicleTitle(line: string, fallbackTrim: string | null): Pick<VehiclePasteExtraction, 'year' | 'make' | 'model' | 'trim'> {
  const parts = splitYearMakeRest(line)
  if (!parts) {
    return { year: null, make: null, model: null, trim: fallbackTrim }
  }

  const tokens = parts.rest.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { year: parts.year, make: parts.make, model: null, trim: fallbackTrim }
  }

  let trim = fallbackTrim
  let modelTokens = tokens

  if (!trim && tokens.length > 1 && shouldTreatAsTrim(tokens[tokens.length - 1])) {
    trim = tokens[tokens.length - 1]
    modelTokens = tokens.slice(0, -1)
  }

  return {
    year: parts.year,
    make: parts.make,
    model: modelTokens.join(' ') || null,
    trim,
  }
}

function extractTitleVehicleFields(text: string): Pick<VehiclePasteExtraction, 'year' | 'make' | 'model' | 'trim'> {
  const lines = linesOf(text)
  const labeledTrim = extractTrimFromLabeledField(text)

  for (const candidate of titleCandidates(text)) {
    const parsed = parseVehicleTitle(candidate, labeledTrim)
    if (parsed.year && parsed.make && parsed.model) {
      return parsed
    }
  }

  const firstDetailLine = lines.find(line => /^[A-Za-z0-9][A-Za-z0-9 .+/\-]{0,20}\s+•/.test(line))
  const inferredTrim = labeledTrim ?? firstDetailLine?.split('•')[0]?.trim().split(/\s+/)[0] ?? null

  for (const candidate of titleCandidates(text)) {
    const parsed = parseVehicleTitle(candidate, inferredTrim)
    if (parsed.year && parsed.make && parsed.model) {
      return parsed
    }
  }

  return { year: null, make: null, model: null, trim: labeledTrim ?? null }
}

function extractStatus(text: string): VehiclePasteExtraction['status'] {
  if (/\b(you made an offer|won|thank you for your purchase|my purchases|checkout)\b/i.test(text)) {
    return 'staging'
  }
  return null
}

function collectNotes(text: string): string | null {
  const lines = linesOf(text)
  const notes: string[] = []
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (!notes.some(note => note.toLowerCase() === trimmed.toLowerCase())) {
      notes.push(trimmed)
    }
  }

  const ownerIndex = lines.findIndex(line => /^Owner\(s\)$/i.test(line))
  const normalizedOwnerCount =
    text.match(/\b(\d+)\s+Owner\(s\)/i)?.[1] ??
    (ownerIndex > 0 ? parseInteger(lines[ownerIndex - 1])?.toString() : null)
  if (normalizedOwnerCount) add(`${normalizedOwnerCount} owner(s)`)

  const accidentIndex = lines.findIndex(line => /^Accident\(s\)$/i.test(line))
  const accidentCount =
    text.match(/\b(\d+)\s+Accident\(s\)/i)?.[1] ??
    (accidentIndex > 0 ? parseInteger(lines[accidentIndex - 1])?.toString() : null)
  if (accidentCount) add(`${accidentCount} accident(s)`)

  const patterns = [
    /\bTitle Absent(?: \([^)]+\))?/i,
    /\bCracked Windshield\b/i,
    /\bBroken Tail Lamp\b/i,
    /\bRental\b/i,
    /\bBody Damage\b/i,
    /\bGlass Damaged\/Cracked\b/i,
    /\bDamaged Wheels\b/i,
    /\bUneven Tread Wear\b/i,
    /\bNavigation\b/i,
    /\bBackup camera\b/i,
    /\bVehicle comes with \d+ key\b/i,
    /\bVehicle comes with \d+ keys\b/i,
  ]

  for (const pattern of patterns) {
    add(text.match(pattern)?.[0] ?? null)
  }

  const airConditioningIndex = lines.findIndex(line => /^Air conditioning operation$/i.test(line))
  if (airConditioningIndex !== -1) {
    const nearby = lines.slice(airConditioningIndex + 1, airConditioningIndex + 4).join(' ')
    if (/Inoperable/i.test(nearby)) add('Air conditioning inoperable')
  }

  const sellerLine = lines.find(line => /^[A-Za-z0-9 .&'-]+,\s*[A-Z]{2}$/.test(line))
  if (sellerLine) add(`Seller location ${sellerLine}`)

  return notes.length > 0 ? notes.slice(0, 6).join('; ') : null
}

function hasVehicleIdentity(data: VehiclePasteExtraction): boolean {
  return Boolean(data.vin || (data.year && data.make && data.model))
}

function hasAuctionContext(data: VehiclePasteExtraction): boolean {
  return Boolean(
    data.purchase_price != null ||
    data.auction_name ||
    data.auction_lot ||
    data.purchased_at ||
    data.mileage != null
  )
}

function mergeExtractions(primary: VehiclePasteExtraction, secondary: VehiclePasteExtraction): VehiclePasteExtraction {
  return normalizeExtraction({
    vin: primary.vin ?? secondary.vin,
    year: primary.year ?? secondary.year,
    make: primary.make ?? secondary.make,
    model: primary.model ?? secondary.model,
    trim: primary.trim ?? secondary.trim,
    mileage: primary.mileage ?? secondary.mileage,
    color: primary.color ?? secondary.color,
    purchase_price: primary.purchase_price ?? secondary.purchase_price,
    purchased_at: primary.purchased_at ?? secondary.purchased_at,
    purchased_from: primary.purchased_from ?? secondary.purchased_from,
    acquisition_source: primary.acquisition_source ?? secondary.acquisition_source,
    auction_name: primary.auction_name ?? secondary.auction_name,
    auction_lot: primary.auction_lot ?? secondary.auction_lot,
    status: primary.status ?? secondary.status,
    notes: primary.notes ?? secondary.notes,
  })
}

function normalizeExtraction(raw: VehiclePasteExtraction): VehiclePasteExtraction {
  const vin = raw.vin
    ? raw.vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').slice(0, 17).toUpperCase() || null
    : null

  return {
    vin,
    year: raw.year && raw.year >= 1900 && raw.year <= 2100 ? raw.year : null,
    make: raw.make?.trim().slice(0, 60) || null,
    model: raw.model?.trim().slice(0, 60) || null,
    trim: raw.trim?.trim().slice(0, 80) || null,
    mileage: raw.mileage != null && raw.mileage >= 0 ? Math.round(raw.mileage) : null,
    color: raw.color?.trim().slice(0, 40) || null,
    purchase_price: raw.purchase_price != null && raw.purchase_price >= 0
      ? Math.round(raw.purchase_price * 100) / 100
      : null,
    purchased_at: normalizeDate(raw.purchased_at),
    purchased_from: raw.purchased_from?.trim().slice(0, 120) || null,
    acquisition_source: raw.acquisition_source ?? null,
    auction_name: raw.auction_name?.trim().slice(0, 120) || null,
    auction_lot: raw.auction_lot?.trim().slice(0, 80) || null,
    status: raw.status ?? null,
    notes: raw.notes?.trim().slice(0, 2000) || null,
  }
}

export function extractVehicleFromPastedTextHeuristically(text: string): VehiclePasteExtraction {
  const plainText = toSingleLine(text)
  const auctionName = findAuctionPlatform(plainText)
  const titleFields = extractTitleVehicleFields(text)
  const extraction: VehiclePasteExtraction = {
    vin: extractVin(plainText),
    year: titleFields.year,
    make: titleFields.make,
    model: titleFields.model,
    trim: titleFields.trim,
    mileage: extractMileage(plainText),
    color: extractColor(plainText),
    purchase_price: extractPurchasePrice(text),
    purchased_at: extractPurchasedAt(plainText),
    purchased_from: auctionName,
    acquisition_source: auctionName ? 'auction' : null,
    auction_name: auctionName,
    auction_lot: extractAuctionLot(plainText),
    status: extractStatus(plainText),
    notes: collectNotes(text),
  }

  return normalizeExtraction(extraction)
}

async function extractVehicleFromPastedTextWithAi(text: string): Promise<VehiclePasteExtraction> {
  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 700,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${USER_PROMPT}\n\nPasted text:\n${text}` },
    ],
  })

  const reply = response.choices[0]?.message?.content ?? ''
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${reply.slice(0, 200)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error(`Invalid JSON in AI response: ${reply.slice(start, start + 200)}`)
  }

  const result = VehiclePasteSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error('AI response shape invalid')
  }

  return normalizeExtraction(result.data)
}

export async function extractVehicleFromPastedText(text: string): Promise<VehiclePasteExtraction> {
  const heuristic = extractVehicleFromPastedTextHeuristically(text)
  if (hasVehicleIdentity(heuristic) && hasAuctionContext(heuristic)) {
    return heuristic
  }

  if (!process.env.OPENROUTER_API_KEY) {
    if (hasVehicleIdentity(heuristic)) return heuristic
    throw new Error('OPENROUTER_API_KEY not set')
  }

  const ai = await extractVehicleFromPastedTextWithAi(text)
  return mergeExtractions(heuristic, ai)
}
