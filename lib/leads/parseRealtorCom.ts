/**
 * Realtor.com Lead Parser
 *
 * Realtor.com sends lead inquiry emails from notifications@realtor.com
 * Format typically includes buyer info, property address, and inquiry
 *
 * This parser extracts structured lead data for RealtyWyze lead inbox.
 */

import { ParsedLead } from './parser'

/**
 * Parse a Realtor.com lead email
 * Returns null if not a Realtor.com email or parsing fails
 */
export function parseRealtorComLead(
  subject: string,
  textBody: string,
  fromEmail: string
): ParsedLead | null {
  // Verify it's from Realtor.com
  if (!fromEmail.includes('realtor')) return null

  const text = `${subject}\n${textBody}`.toLowerCase()
  if (!text.includes('inquiry') && !text.includes('lead') && !text.includes('buyer')) {
    return null
  }

  const bodyText = textBody

  // Realtor.com format varies; look for common field patterns
  // Typically includes:
  //   Buyer Name / Agent Name
  //   Email
  //   Phone
  //   Property Address
  //   Message / Comments

  const name = extractField(bodyText, ['Buyer', 'Agent', 'Contact', 'Name'], '')
  const email = extractField(bodyText, ['Email'], '')
  const phone = extractField(bodyText, ['Phone', 'Contact Phone', 'Mobile'], '')
  const property = extractField(
    bodyText,
    ['Property Address', 'Address', 'Property', 'Listing Address'],
    ''
  )
  const message = extractField(bodyText, ['Message', 'Comment', 'Inquiry', 'Notes'], '')

  // Require at least name or email or phone
  if (!name && !email && !phone) {
    return null
  }

  const zip = extractZip(property)

  return {
    name: name || extractNameFromEmail(email) || 'Realtor.com Inquiry',
    email: email || '',
    phone: cleanPhone(phone) || '',
    zip: zip || '',
    vehicle: property || '',
    vin: '',
    listed_price: null,
    comments: message || `Property: ${property}`,
    source: 'realtor.com' as any,
    raw_text: bodyText,
    is_hot: true,
  }
}

/**
 * Helper: Extract a field value from email body
 * Looks for patterns like "Field: value" or "Field\nvalue"
 */
function extractField(text: string, labels: string[], defaultValue: string = ''): string {
  for (const label of labels) {
    // Try pattern: "Label: value"
    const colonMatch = text.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'))
    if (colonMatch) {
      return colonMatch[1].trim()
    }

    // Try pattern: "Label\nvalue"
    const newlineMatch = text.match(new RegExp(`${label}\\s*\\n\\s*([^\\n]+)`, 'i'))
    if (newlineMatch) {
      return newlineMatch[1].trim()
    }
  }
  return defaultValue
}

/**
 * Extract ZIP code from text (5 digits)
 */
function extractZip(text: string): string {
  const match = text.match(/\b(\d{5})(?:-\d{4})?\b/)
  return match ? match[1] : ''
}

/**
 * Clean phone number (remove formatting, extract digits)
 */
function cleanPhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Require 10 digits minimum (US)
  return digits.length >= 10 ? digits.slice(-10) : ''
}

/**
 * Extract a name from an email address (everything before @)
 */
function extractNameFromEmail(email: string): string {
  if (!email) return ''
  const name = email.split('@')[0]
  return name
    .replace(/[._]/g, ' ')
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
