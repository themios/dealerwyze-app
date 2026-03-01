export type LeadSource = 'cargurus' | 'autotrader' | 'offerup' | 'cargurus_digest' | 'facebook' | 'other'

export interface ParsedLead {
  name: string
  email: string
  phone: string
  zip: string
  vehicle: string
  vin: string
  listed_price: number | null
  comments: string
  source: LeadSource
  raw_text: string
}

function field(text: string, label: string): string {
  const match = text.match(new RegExp(label + '[:\\s]+(.+?)(?:\\n|\\r|$)', 'i'))
  return match?.[1]?.trim().replace(/\uFFFD/g, '') || ''
}

function emailField(text: string, label: string): string {
  const raw = field(text, label)
  const match = raw.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  return match?.[0] || raw
}

function parsePrice(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function extractComments(text: string): string {
  const match = text.match(/Comments\s*\n+([\s\S]+?)(?:\n\s*\n|\nListing|\nVIN:|$)/i)
  return match?.[1]?.trim() || ''
}

/** CarGurus individual lead — "Lead Submission from CarGurus" */
export function parseCarGurusLead(subject: string, textBody: string): ParsedLead | null {
  if (!subject.includes('Lead Submission from CarGurus')) return null

  const firstName = field(textBody, 'First Name')
  const lastName = field(textBody, 'Last Name')
  if (!firstName) return null

  return {
    name: `${firstName} ${lastName}`.trim(),
    email: emailField(textBody, 'Email'),
    phone: field(textBody, 'Telephone'),
    zip: field(textBody, 'ZIP code'),
    vehicle: field(textBody, 'Vehicle'),
    vin: field(textBody, 'VIN'),
    listed_price: parsePrice(field(textBody, 'Listed Price')),
    comments: extractComments(textBody),
    source: 'cargurus',
    raw_text: textBody,
  }
}

/** CarGurus LeadAI digest — daily summary with multiple leads */
export function parseCarGurusDigest(subject: string, textBody: string): ParsedLead[] {
  const isDigest =
    subject.toLowerCase().includes('leadai') ||
    subject.toLowerCase().includes('lead ai') ||
    textBody.toLowerCase().includes('leadai') ||
    textBody.includes('has submitted a new lead') ||
    textBody.includes('LeadAI Activity')
  if (!isDigest) return []

  const leads: ParsedLead[] = []

  // Modern CarGurus digest format (HTML-converted):
  // "[Name] has submitted a new lead [Vehicle Year Make Model]"
  // "Contact details ... email, name, phone, ZIP code: XXXXX"  (order varies in HTML)
  // "Vehicle details ... VIN: ..., Listed price: $..."
  //
  // Capture the name from the header ("Lana has submitted") and each contact
  // field independently — don't rely on comma-position ordering.
  const headerRe = /(.+?)\s+has submitted a new lead\s+(.+)/g
  const headers: Array<{ index: number; headerName: string; vehicle: string }> = []
  let hm: RegExpExecArray | null
  while ((hm = headerRe.exec(textBody)) !== null) {
    headers.push({ index: hm.index, headerName: hm[1].trim(), vehicle: hm[2].trim() })
  }

  for (let i = 0; i < headers.length; i++) {
    const blockStart = headers[i].index
    const blockEnd = i + 1 < headers.length ? headers[i + 1].index : textBody.length
    const block = textBody.slice(blockStart, blockEnd)

    // Extract each field independently from the Contact details section.
    // The HTML email may order email/name/phone differently after conversion.
    const contactSection = block.match(/Contact details([\s\S]*?)(?:Vehicle details|Activity|$)/i)?.[1] || ''

    // Email — find the first valid email address in the contact section
    const emailMatch = contactSection.match(/\b([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})\b/)
    const email = emailMatch?.[1]?.trim() || ''

    // Phone — find the first phone number
    const phoneMatch = contactSection.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
    const phone = phoneMatch?.[0]?.replace(/[()]/g, '').trim() || ''

    // ZIP
    const zipMatch = contactSection.match(/ZIP\s*code:\s*(\d{5})/i)
    const zip = zipMatch?.[1] || ''

    // Name — try single-line format first: "Full Name, Phone, Email, ZIP code: XXXXX"
    // Then fall back to stripping approach using header name as seed.
    let name = headers[i].headerName
    if (contactSection) {
      // Single-line: first token(s) before the phone number are the full name
      const singleLine = contactSection.match(/^\s*([A-Z][^\d,]+?),\s*\(?\d{3}\)?/m)
      if (singleLine) {
        name = singleLine[1].trim()
      } else {
        const stripped = contactSection
          .replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '')
          .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/gi, '')
          .replace(/ZIP\s*code:\s*\d{5}/gi, '')
          .replace(/[,\s]+/g, ' ')
          .trim()
        const fullNameMatch = stripped.match(/([A-Z][a-záéíóúüñ\w]*(?:\s+[A-Z][a-záéíóúüñ\w]*){1,3})/u)
        if (fullNameMatch) name = fullNameMatch[1].trim()
      }
    }

    // Vehicle details
    const vinMatch = block.match(/VIN:\s*([A-Z0-9]{17})/i)
    const priceMatch = block.match(/Listed\s*price:\s*\$?([\d,]+)/i)

    if (!name) continue

    leads.push({
      name,
      email,
      phone,
      zip,
      vehicle: headers[i].vehicle,
      vin: vinMatch?.[1] || '',
      listed_price: priceMatch ? parsePrice(priceMatch[1]) : null,
      comments: '',
      source: 'cargurus_digest',
      raw_text: block,
    })
  }

  // Fallback: older digest format with labeled First Name / Last Name fields
  if (leads.length === 0) {
    const sections = textBody.split(/\n(?:-{3,}|\*{3,})\n/g)
    for (const section of sections) {
      const firstName = field(section, 'First Name')
      const lastName = field(section, 'Last Name')
      if (!firstName) continue
      leads.push({
        name: `${firstName} ${lastName}`.trim(),
        email: field(section, 'Email'),
        phone: field(section, 'Telephone') || field(section, 'Phone'),
        zip: field(section, 'ZIP code') || field(section, 'ZIP'),
        vehicle: field(section, 'Vehicle'),
        vin: field(section, 'VIN'),
        listed_price: parsePrice(field(section, 'Listed Price') || field(section, 'Price')),
        comments: extractComments(section),
        source: 'cargurus_digest',
        raw_text: section,
      })
    }
  }

  return leads
}

/** AutoTrader lead email */
export function parseAutoTraderLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  const isAutoTrader =
    fromEmail.toLowerCase().includes('autotrader.com') ||
    subject.toLowerCase().includes('autotrader') ||
    textBody.includes('AutoTrader')

  if (!isAutoTrader) return null

  // AutoTrader can use "Contact Name:" or separate "First Name:" / "Last Name:"
  const contactName = field(textBody, 'Contact Name') || field(textBody, 'Customer Name')
  const firstName = field(textBody, 'First Name')
  const lastName = field(textBody, 'Last Name')
  const name = contactName || `${firstName} ${lastName}`.trim()
  if (!name) return null

  // Vehicle can be a single "Vehicle:" line or broken into Year/Make/Model
  const vehicleLine = field(textBody, 'Vehicle') ||
    `${field(textBody, 'Year')} ${field(textBody, 'Make')} ${field(textBody, 'Model')}`.trim()

  const priceStr = field(textBody, 'Listed Price') || field(textBody, 'Price') || field(textBody, 'Asking Price')

  const commentsMatch = textBody.match(
    /(?:Message|Comments|Customer Message|Buyer's Message)[:\s]*\n*([\s\S]+?)(?:\n\s*\n|Vehicle Details:|Listing Details:|$)/i
  )

  return {
    name,
    email: emailField(textBody, 'Email') || emailField(textBody, 'Email Address'),
    phone: field(textBody, 'Phone') || field(textBody, 'Telephone') || field(textBody, 'Mobile'),
    zip: field(textBody, 'Zip') || field(textBody, 'ZIP') || field(textBody, 'Zip Code'),
    vehicle: vehicleLine,
    vin: field(textBody, 'VIN'),
    listed_price: parsePrice(priceStr),
    comments: commentsMatch?.[1]?.trim() || field(textBody, 'Message'),
    source: 'autotrader',
    raw_text: textBody,
  }
}

/** OfferUp buyer message forwarded to dealer */
export function parseOfferUpLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  const isOfferUp =
    fromEmail.toLowerCase().includes('offerup.com') ||
    subject.toLowerCase().includes('offerup') ||
    textBody.includes('OfferUp')

  if (!isOfferUp) return null

  // OfferUp format varies — extract best-effort
  const nameMatch = textBody.match(/(?:From|Buyer|Customer|Sent by)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i)
  const name = nameMatch?.[1]?.trim() || 'OfferUp Buyer'

  const vehicleMatch = subject.match(/about[:\s]+(.+?)(?:\s*[-|]|$)/i) ||
    textBody.match(/(?:interested in|your listing)[:\s]*["']?(.+?)["']?(?:\n|$)/i)

  const emailMatch = textBody.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i)
  const phoneMatch = textBody.match(/\b(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/)

  return {
    name,
    email: emailMatch?.[0] || '',
    phone: phoneMatch?.[1] || '',
    zip: '',
    vehicle: vehicleMatch?.[1]?.trim() || '',
    vin: '',
    listed_price: null,
    comments: textBody.slice(0, 500).trim(),
    source: 'offerup',
    raw_text: textBody,
  }
}

/** Facebook Marketplace buyer inquiry email */
export function parseFacebookMarketplaceLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  // Primary: sender domain is authoritative. Secondary: body must also confirm Facebook
  // to avoid false-positives from other platforms using similar subject phrasing.
  const isFacebook =
    fromEmail.includes('facebookmail.com') ||
    (
      textBody.includes('Facebook Marketplace') &&
      (
        subject.toLowerCase().includes('interested in your') ||
        subject.toLowerCase().includes('new message about your')
      )
    )

  if (!isFacebook) return null

  // Extract buyer name from subject or body
  const nameMatch =
    subject.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)*) (?:is interested in your|sent you a message)/i) ||
    textBody.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)*) sent you a message/im)

  const name = nameMatch?.[1]?.trim() || 'Facebook Buyer'

  // Extract vehicle from subject, stripping mail-client suffixes like "- [External]"
  const vehicleFromSubject = subject
    .match(/(?:interested in your|new message about your)\s+(.+)/i)?.[1]
    ?.replace(/\s*[-|]\s*(Marketplace|External|Facebook)[^)]*$/i, '')
    .trim() || ''
  const vehicleFromBody = textBody.match(/(?:Listing)[:\s]+(.+)/i)?.[1]?.trim() || ''
  const vehicle = vehicleFromSubject || vehicleFromBody

  // Extract buyer's message (quoted block)
  const commentsMatch = textBody.match(/"([\s\S]+?)"/m)
  const comments = commentsMatch?.[1]?.trim() || ''

  return {
    name,
    email: '',   // FB shields buyer email
    phone: '',   // not provided
    zip: '',
    vehicle,
    vin: '',
    listed_price: null,
    comments: comments || textBody.slice(0, 500).trim(),
    source: 'facebook',
    raw_text: textBody,
  }
}

/**
 * Try all parsers and return the first match.
 * For digest emails use parseCarGurusDigest (returns array).
 */
export function parseAnyLead(
  subject: string,
  textBody: string,
  fromEmail = ''
): ParsedLead | null {
  return (
    parseCarGurusLead(subject, textBody) ||
    parseAutoTraderLead(subject, textBody, fromEmail) ||
    parseOfferUpLead(subject, textBody, fromEmail) ||
    parseFacebookMarketplaceLead(subject, textBody, fromEmail) ||
    null
  )
}
