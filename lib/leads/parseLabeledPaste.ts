import { normalizePhone as normalizePhoneDigits } from '@/lib/utils/phone'
import {
  buildFullName,
  sanitizeEmail,
  sanitizePersonName,
  stripFieldLabel,
} from './sanitizeLeadFields'

/**
 * Parser for pasted lead text in "labeled field" format, e.g. from a CRM or
 * dealer lead view (Carsforsale.com, CarGurus, or generic):
 *
 *   Pauline Brown
 *   Contact Type: RetailSalesperson: Unassigned
 *   Email: brown.pauline38@gmail.com
 *   Phone: N/A -
 *   ...
 *   I'm interested and want to know more about the 2009 Acura MDX you have listed for $7,495
 *   Lead Source: Carsforsale.com
 */

export interface LabeledPasteLead {
  name:    string
  phone:   string | null
  email:   string | null
  note:    string | null
  vehicle: string | null
  source:  string
}

function takeAfterLabel(text: string, label: string): string | null {
  // Same line: "Email: foo@bar.com" or "Email:\nfoo@bar.com"
  const re = new RegExp(`${label}\\s*:?\\s*([^\\n]*)`, 'i')
  const m = text.match(re)
  if (!m) return null
  let v = m[1].trim()
  if (!v) {
    // Value on next line (e.g. "Email:\nbrown.pauline38@gmail.com")
    const after = text.slice((m.index ?? 0) + m[0].length)
    const nextLine = after.split(/\r?\n/)[0]?.trim()
    v = nextLine ?? ''
  }
  if (!v || /^n\/a[\s\-]*$/i.test(v) || v === '-') return null
  return v
}

/** Returns true if the text looks like a labeled lead card (Email:/Phone: and Lead Source or Contact Type) */
export function isLabeledLeadPaste(text: string): boolean {
  const t = text.trim()
  const hasContact = /Email\s*:/i.test(t) || /Phone\s*:/i.test(t)
  const hasMeta = /Lead Source\s*:/i.test(t) || /Contact Type\s*:/i.test(t) || /RetailSalesperson\s*:/i.test(t)
  return hasContact && hasMeta
}

/** Parse labeled lead paste into structured fields. Returns null if we can't get at least a name or email. */
export function parseLabeledLeadPaste(text: string): LabeledPasteLead | null {
  const rawEmail = takeAfterLabel(text, 'Email') ?? takeAfterLabel(text, 'E-mail')
  const email = sanitizeEmail(rawEmail ?? '') || null

  const rawPhone = takeAfterLabel(text, 'Phone')
  const phone = rawPhone ? (normalizePhoneDigits(rawPhone) || null) : null

  const firstName = stripFieldLabel(takeAfterLabel(text, 'First Name') ?? '')
  const lastName = stripFieldLabel(takeAfterLabel(text, 'Last Name') ?? '')
  const fromLabeledParts = buildFullName(firstName, lastName)

  // Name: often the first non-empty line that isn't a label
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  let name = fromLabeledParts
  if (!name) {
    for (const line of lines) {
      if (/^(Contact Type|Email|E-mail|Phone|Address|First Name|Last Name|RetailSalesperson|Add A Note|Use this section)/i.test(line)) break
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) break // date line
      if (line.length > 2 && line.length < 80 && !/^https?:\/\//i.test(line)) {
        name = sanitizePersonName(line)
        break
      }
    }
  }

  // Lead Source
  const rawSource = takeAfterLabel(text, 'Lead Source')
  let source = 'other'
  if (rawSource) {
    const s = rawSource.toLowerCase()
    if (s.includes('carsforsale') || s.includes('cars for sale')) source = 'carsforsale'
    else if (s.includes('cargurus')) source = 'cargurus'
    else if (s.includes('autotrader')) source = 'autotrader'
    else if (s.includes('offerup')) source = 'offerup'
    else if (s.includes('facebook')) source = 'facebook'
    else if (s.includes('kbb')) source = 'kbb'
    else if (s.includes('autolist')) source = 'autolist'
  }

  // Vehicle: e.g. "2009 Acura MDX" and optional price
  const vehicleYearMakeModel = text.match(/\b(19|20)\d{2}\s+[A-Za-z][A-Za-z\-]+\s+[A-Za-z][A-Za-z0-9\-]+(?:\s+[A-Za-z0-9\-]+)?/)?.[0]?.trim()
  const pricePart = text.match(/\$[\d,]+/)?.[0]
  const vehicle = vehicleYearMakeModel
    ? (pricePart ? `${vehicleYearMakeModel} — ${pricePart}` : vehicleYearMakeModel)
    : null

  // Note: first substantial paragraph (e.g. "I'm interested and want to know more...")
  const interestMatch = text.match(/I'm interested[\s\S]*?(?=Lead Source:|Lead Type:|\n\n|$)/i)
  const note = interestMatch ? interestMatch[0].replace(/\s+/g, ' ').trim().slice(0, 500) : null

  if (!name && !email) return null
  if (!name && email) name = email.split('@')[0].replace(/[._]/g, ' ') || 'Unknown'

  return {
    name: sanitizePersonName(name) || 'Unknown',
    phone,
    email,
    note: note || null,
    vehicle,
    source,
  }
}
