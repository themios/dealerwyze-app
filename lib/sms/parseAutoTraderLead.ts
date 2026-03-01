/**
 * AutoTrader lead parser.
 * Handles the standard "Wallet Lead" email format from AutoTrader.
 *
 * Extracts: name, email, phone, zip, buyer comment, vehicle, VIN,
 * and finance details (stored in notes).
 */

export interface ParsedAutoTraderLead {
  name:     string
  phone:    string | null
  email:    string | null
  zip:      string | null
  note:     string | null   // buyer comment
  vehicle:  string | null   // "2024 Honda HR-V Sport"
  vin:      string | null
  finance:  string | null   // summary of offer details if present
}

/** Returns true if text looks like an AutoTrader lead email */
export function isAutoTraderLead(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('autotrader') && lower.includes('customer information')
}

/** Extract a labeled field value: "Name: John Krul" → "John Krul" */
function field(text: string, label: string): string | null {
  const re = new RegExp(`${label}[:\\s]+(.+)`, 'i')
  const match = text.match(re)
  if (!match) return null
  const val = match[1].trim()
  // Return null for AutoTrader's "not specified" placeholders
  if (/customer did not specify|not specified|n\/a/i.test(val)) return null
  return val || null
}

export function parseAutoTraderLead(text: string): ParsedAutoTraderLead | null {
  // ── Contact fields ─────────────────────────────────────────────────────────
  const name  = field(text, 'Name')
  const email = field(text, 'E-Mail Address') ?? field(text, 'Email')
  const zip   = field(text, 'ZIP Code') ?? field(text, 'Zip')

  let phone: string | null = field(text, 'Phone')
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    const norm = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    phone = norm.length === 10 ? norm : null
  }

  if (!name) return null

  // ── Buyer comment ──────────────────────────────────────────────────────────
  // Sits between "Buyer Comments:" and the next section header or blank lines
  const commentMatch = text.match(/Buyer Comments?:\s*\n([\s\S]*?)(?:\n\s*\n|\nOffer Details|\nVehicle Information)/i)
  const note = commentMatch
    ? commentMatch[1].replace(/^\s+/gm, '').trim().replace(/\n+/g, ' ') || null
    : null

  // ── Vehicle ────────────────────────────────────────────────────────────────
  const year  = field(text, 'Year')
  const make  = field(text, 'Make')
  const model = field(text, 'Model')
  const trim  = field(text, 'Trim')
  const vin   = field(text, 'VIN')

  let vehicle: string | null = null
  if (year && make && model) {
    vehicle = [year, make, model, trim].filter(Boolean).join(' ')
  } else {
    // Fallback: grab vehicle from header line e.g. "2024 Honda HR-V"
    const headerMatch = text.match(/\b(19|20)\d{2}\s+[A-Za-z][a-zA-Z\-]+(?:\s+[A-Za-z][a-zA-Z\-]+){0,3}/)
    vehicle = headerMatch ? headerMatch[0].trim() : null
  }

  // ── Finance summary (stored in notes, not on customer record) ─────────────
  const financeMatch = text.match(/Offer Details:([\s\S]*?)(?:\nVehicle Information|\n\n)/i)
  let finance: string | null = null
  if (financeMatch) {
    finance = financeMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(', ')
      .replace(/,\s*,/g, ',')
      .trim() || null
  }

  return { name, phone, email, zip, note, vehicle, vin, finance }
}
