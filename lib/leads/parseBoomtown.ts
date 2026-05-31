/**
 * Boomtown CRM Forward Parser
 *
 * Handles CRM forwards from Boomtown (when agents forward leads from their CRM to RealtyWyze).
 * Boomtown emails typically include agent info, buyer contact, property, and inquiry.
 *
 * This parser is more lenient than Zillow/Realtor.com since CRM forward formats vary widely.
 */

import { ParsedLead } from './parser'

/**
 * Parse a Boomtown CRM forward email
 * Returns null if parsing fails or insufficient data
 */
export function parseBoomtownLead(
  subject: string,
  textBody: string,
  fromEmail: string
): ParsedLead | null {
  const text = `${subject}\n${textBody}`.toLowerCase()

  // Lenient matching: look for CRM-like indicators
  if (
    !text.includes('boomtown') &&
    !text.includes('crm') &&
    !text.includes('lead') &&
    !text.includes('inquiry') &&
    !text.includes('buyer') &&
    !text.includes('property')
  ) {
    return null
  }

  const bodyText = textBody

  // Extract using flexible patterns (CRM forwards vary widely)
  const buyerName = extractField(bodyText, ['Buyer', 'Prospect', 'Contact', 'Name'], '')
  const buyerEmail = extractField(bodyText, ['Email', 'Buyer Email', 'Contact Email'], '')
  const buyerPhone = extractField(bodyText, ['Phone', 'Mobile', 'Contact Phone', 'Telephone'], '')
  const property = extractField(
    bodyText,
    ['Property', 'Address', 'Listing', 'Property Address'],
    ''
  )
  const message = extractField(bodyText, ['Message', 'Comment', 'Notes', 'Inquiry'], '')
  const agentName = extractField(bodyText, ['Agent', 'Agent Name', 'From Agent'], '')

  // Require at least name or email or phone
  if (!buyerName && !buyerEmail && !buyerPhone) {
    return null
  }

  const zip = extractZip(property)

  // If we found agent name but no buyer name, use agent as source
  const finalName = buyerName || extractNameFromEmail(buyerEmail) || agentName || 'CRM Lead'

  return {
    name: finalName,
    email: buyerEmail || '',
    phone: cleanPhone(buyerPhone) || '',
    zip: zip || '',
    vehicle: property || '',
    vin: '',
    listed_price: null,
    comments: message || `Property: ${property}` || 'CRM forwarded lead',
    source: 'boomtown' as any,
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

    // Try pattern: "Label = value"
    const equalsMatch = text.match(new RegExp(`${label}\\s*=\\s*([^\\n]+)`, 'i'))
    if (equalsMatch) {
      return equalsMatch[1].trim()
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
