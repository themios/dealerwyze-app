/**
 * Zillow Premier Agent Lead Parser
 *
 * Zillow sends lead inquiry emails with format:
 *   From: noreply@zillowgroup.com
 *   Subject: "New lead interest: [Property Address]" or similar
 *   Body: Contains buyer name, phone, email, property address, and inquiry
 *
 * This parser extracts structured lead data for RealtyWyze lead inbox.
 */

import { ParsedLead } from './parser'

/**
 * Parse a Zillow Premier Agent lead email
 * Returns null if not a Zillow email or parsing fails
 */
export function parseZillowLead(
  subject: string,
  textBody: string,
  fromEmail: string
): ParsedLead | null {
  // Verify it's from Zillow
  if (!fromEmail.includes('zillow')) return null

  const text = `${subject}\n${textBody}`.toLowerCase()
  if (!text.includes('lead interest') && !text.includes('inquiry') && !text.includes('premier agent')) {
    return null
  }

  // Extract buyer info using flexible regex patterns
  // Zillow format varies but typically:
  //   Buyer: Name
  //   Email: email@example.com
  //   Phone: (555) 123-4567
  //   Property: [Address]
  //   Message/Comments: [buyer's message]

  const bodyText = textBody
  const name = extractField(bodyText, ['Buyer', 'Name'], '')
  const email = extractField(bodyText, ['Email'], '')
  const phone = extractField(bodyText, ['Phone', 'Mobile', 'Telephone'], '')
  const property = extractField(bodyText, ['Property', 'Address', 'Listing'], '')
  const message = extractField(bodyText, ['Message', 'Comment', 'Inquiry'], '')

  // Require at least name or email or phone
  if (!name && !email && !phone) {
    return null
  }

  // Try to extract location/zip from property address if present
  const zip = extractZip(property)

  return {
    name: name || extractNameFromEmail(email) || 'Zillow Inquiry',
    email: email || '',
    phone: cleanPhone(phone) || '',
    zip: zip || '',
    vehicle: property || '',
    vin: '',
    listed_price: null,
    comments: message || `Property: ${property}`,
    source: 'zillow' as const,
    raw_text: bodyText,
    is_hot: true, // Zillow leads are typically hot
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
  // Convert john.doe@... to "John Doe" or john_smith to "John Smith"
  return name
    .replace(/[._]/g, ' ')
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
