export type LeadSource = 'cargurus' | 'autotrader' | 'offerup' | 'cargurus_digest' | 'facebook' | 'kbb' | 'autolist' | 'carsforsale' | 'other'

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
  /** Source explicitly flagged this as a high-priority / hot lead */
  is_hot?: boolean
  /** Customer previously inquired and is re-engaging */
  is_reengaged?: boolean
  /** Structured shopper-signal flags used for prioritization */
  signal_flags?: Array<
    'appointment' | 'warm_shopper' | 'reengaged' | 'returning_shopper' |
    'low_competition' | 'local_shopper' | 'viewed_vdp' | 'callback_requested' | 'manual_priority'
  >
  /** Human-readable summary for the CRM */
  signal_summary?: string
}

function field(text: string, label: string): string {
  const match = text.match(new RegExp(label + '[:\\s]+(.+?)(?:\\n|\\r|$)', 'i'))
  return match?.[1]?.trim().replace(/\uFFFD/g, '') || ''
}

function emailField(text: string, label: string): string {
  const raw = field(text, label)
  if (/not specified|customer did not specify|n\/a/i.test(raw)) return ''
  const match = raw.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  return match?.[0] || ''
}

function parsePrice(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function extractComments(text: string): string {
  const match = text.match(/Comments\s*\n+([\s\S]+?)(?:\n\s*\n|\nListing|\nVIN:|$)/i)
  return match?.[1]?.trim() || ''
}

/** CarGurus phone lead — "Phone Lead from CarGurus" (caller info only) */
export function parseCarGurusPhoneLead(subject: string, textBody: string): ParsedLead | null {
  if (!subject.includes('Phone Lead from CarGurus') && !textBody.includes('Phone Lead from CarGurus')) return null
  // "Caller Id" is the caller's name; "Phone" is the number.
  // Use 'Phone:' (with colon) so the regex doesn't false-match "Phone Lead from CarGurus"
  // which appears earlier in the email body without a colon.
  const callerId = field(textBody, 'Caller Id')
  const phone = field(textBody, 'Phone:')
  const zip = field(textBody, 'Zip')
  const state = field(textBody, 'State')
  const vehicle = field(textBody, 'Vehicle')
  const listedPriceStr = field(textBody, 'Listed Price')
  const listedPrice = listedPriceStr ? parseFloat(listedPriceStr.replace(/[$,]/g, '')) : null
  if (!phone) return null
  const commentParts: string[] = ['Phone lead from CarGurus - callback needed']
  if (state) commentParts.push(`State: ${state}`)
  return {
    name: callerId || 'CarGurus Caller',
    email: '',
    phone,
    zip: zip || '',
    vehicle: vehicle || '',
    vin: '',
    listed_price: listedPrice && !isNaN(listedPrice) ? listedPrice : null,
    comments: commentParts.join(' | '),
    source: 'cargurus',
    is_hot: true,
    raw_text: textBody,
  }
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
  const shopperSignalsDigest =
    textBody.includes('Shopper Signals have arrived') ||
    textBody.includes('Shopper Signals Digest')
  if (shopperSignalsDigest) {
    const normalized = textBody.replace(/\r/g, '')
    const blocks = normalized
      .split(/View full profile/gi)
      .map(block => block.trim())
      .filter(Boolean)

    const shopperLeads: ParsedLead[] = []
    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)

      if (lines.length < 4) continue

      const name = lines.find(line =>
        /^[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3}$/.test(line) &&
        !/shoppers?|competition|listings|miles away|appointment|warm|profile/i.test(line)
      ) ?? ''

      const vehicle = lines.find(line => /^\d{4}\s+[A-Za-z0-9-]/.test(line)) ?? ''

      if (!name || !vehicle) continue

      const lower = block.toLowerCase()
      const flags = new Set<NonNullable<ParsedLead['signal_flags']>[number]>()

      if (/appointment/i.test(block)) flags.add('appointment')
      if (/warm/i.test(block) || /more likely to close than an average shopper/i.test(block)) flags.add('warm_shopper')
      if (/re-engaged shoppers|reengaged|re-engaged|reconnected|revisited/i.test(block)) flags.add('reengaged')
      if (/viewed your vdp/i.test(block)) flags.add('viewed_vdp')

      const milesMatch = block.match(/(\d+)\s+miles away/i)
      if (milesMatch && Number(milesMatch[1]) <= 75) flags.add('local_shopper')

      if (/no dealers are in competition yet/i.test(lower) || /\b1 other dealer in competition\b/i.test(block)) {
        flags.add('low_competition')
      }

      const connectionMatch = block.match(/(\d+)\s+connections?\s+across/i)
      if (connectionMatch && Number(connectionMatch[1]) >= 5) flags.add('returning_shopper')

      const summaryParts: string[] = []
      if (flags.has('warm_shopper')) summaryParts.push('Above-average likelihood to close')
      if (flags.has('appointment')) summaryParts.push('Appointment signal')
      if (flags.has('reengaged')) summaryParts.push('Re-engaged shopper')
      if (flags.has('low_competition')) summaryParts.push('Low competition')
      if (flags.has('local_shopper') && milesMatch) summaryParts.push(`${milesMatch[1]} miles away`)
      if (connectionMatch) summaryParts.push(`${connectionMatch[1]} total connections`)

      shopperLeads.push({
        name,
        email: '',
        phone: '',
        zip: '',
        vehicle,
        vin: '',
        listed_price: null,
        comments: summaryParts.join(' • '),
        source: 'cargurus_digest',
        raw_text: block,
        is_hot: flags.has('warm_shopper') || flags.has('appointment') || undefined,
        is_reengaged: flags.has('reengaged') || undefined,
        signal_flags: Array.from(flags),
        signal_summary: summaryParts.join(' • ') || undefined,
      })
    }

    if (shopperLeads.length > 0) return shopperLeads
  }

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

    // "Hot Lead" badge appears in the header line right after the vehicle name
    const isHot = /hot\s*lead/i.test(block)
    // "Reengaged" or "Re-engaged" sections in the digest
    const isReengaged = /reengaged|re-engaged|re-engaged lead/i.test(block)

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
      is_hot: isHot || undefined,
      is_reengaged: isReengaged || undefined,
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

  // AutoTrader: Name, Contact Name, Customer Name, or First/Last Name (Lead, Phone Lead, Shopper Reminder all use "Name:")
  const contactName = field(textBody, 'Contact Name') || field(textBody, 'Customer Name') || field(textBody, 'Name')
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
  let phone = field(textBody, 'Phone') || field(textBody, 'Telephone') || field(textBody, 'Mobile')
  if (phone && /not provided|not specified|customer did not specify|n\/a/i.test(phone)) phone = ''
  // AutoTrader Shopper Reminder = customer keeps coming back to the same listing
  const isReengaged = /shopper reminder/i.test(subject) || /shopper reminder/i.test(textBody)
  const isHot = /hot\s*lead|high\s*intent/i.test(textBody)

  return {
    name,
    email: emailField(textBody, 'Email') || emailField(textBody, 'Email Address'),
    phone,
    zip: field(textBody, 'Zip') || field(textBody, 'ZIP') || field(textBody, 'Zip Code'),
    vehicle: vehicleLine,
    vin: field(textBody, 'VIN'),
    listed_price: parsePrice(priceStr),
    comments: commentsMatch?.[1]?.trim() || field(textBody, 'Message'),
    source: 'autotrader',
    raw_text: textBody,
    is_hot: isHot || undefined,
    is_reengaged: isReengaged || undefined,
  }
}

/** KBB lead — same structure as AutoTrader (Dealer Price Quote / Phone Lead from dealerleads@kbb.com) */
export function parseKBBLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  const isKBB =
    fromEmail.toLowerCase().includes('kbb.com') ||
    subject.toLowerCase().includes('kbb') ||
    textBody.includes('Kelley Blue Book')
  if (!isKBB) return null
  const name = field(textBody, 'Name') || field(textBody, 'Contact Name')
  if (!name) return null
  const vehicleLine = field(textBody, 'Vehicle') ||
    `${field(textBody, 'Year')} ${field(textBody, 'Make')} ${field(textBody, 'Model')}`.trim()
  const commentsMatch = textBody.match(
    /(?:Message|Comments|Customer Message|Buyer Comments?)[:\s]*\n*([\s\S]+?)(?:\n\s*\n|Vehicle Information|Vehicle Details|Fraud Awareness|$)/i
  )
  let phone = field(textBody, 'Phone') || field(textBody, 'Telephone')
  if (phone && /not provided|not specified|customer did not specify|n\/a/i.test(phone)) phone = ''
  return {
    name,
    email: emailField(textBody, 'E-Mail Address') || emailField(textBody, 'Email'),
    phone,
    zip: field(textBody, 'ZIP Code') || field(textBody, 'Zip'),
    vehicle: vehicleLine,
    vin: field(textBody, 'VIN'),
    listed_price: parsePrice(field(textBody, 'Price')),
    comments: commentsMatch?.[1]?.trim() || '',
    source: 'kbb',
    raw_text: textBody,
  }
}

/** Autolist — "New connection from Autolist", referrals@autolist.com */
export function parseAutolistLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  const isAutolist =
    fromEmail.toLowerCase().includes('autolist.com') ||
    subject.toLowerCase().includes('autolist') ||
    textBody.includes('New connection from Autolist')
  if (!isAutolist) return null
  // "Christina Ward" then "INTERESTED IN YOUR LISTING" and "Email: ...", "Comments: ..."
  const nameMatch = textBody.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+INTERESTED IN YOUR LISTING/i)
    || textBody.match(/New connection from Autolist\s*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
  const emailMatch = textBody.match(/Email:\s*([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})/i)
  const commentsMatch = textBody.match(/Comments:\s*\n([\s\S]+?)(?=\n\s*\n|\d{4}\s|Vin:|$)/i)
  const vehicleMatch = textBody.match(/(\d{4}\s+[\w\s-]+(?:FWD|RWD|AWD)?)\s*(?:\n|City:)/m)
    || subject.match(/Interested in buying\s+(.+)/i)
  const vinMatch = textBody.match(/Vin:\s*([A-HJ-NPR-Z0-9]{17})/i)
  const priceMatch = textBody.match(/Price:\s*\$?([\d,]+)/)
  const name = nameMatch?.[1]?.trim() || 'Autolist Buyer'
  const email = emailMatch?.[1]?.trim() || ''
  if (!name && !email && !commentsMatch?.[1]) return null
  return {
    name,
    email: email || '',
    phone: '',
    zip: '',
    vehicle: vehicleMatch?.[1]?.trim() || '',
    vin: vinMatch?.[1]?.trim() || '',
    listed_price: priceMatch?.[1] ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null,
    comments: commentsMatch?.[1]?.trim() || '',
    source: 'autolist',
    raw_text: textBody,
  }
}

/** Carsforsale.com — New Lead, New Loan App; from carsforsalemail.com */
export function parseCarsforsaleLead(subject: string, textBody: string, fromEmail: string): ParsedLead | null {
  const isCarsforsale =
    fromEmail.toLowerCase().includes('carsforsale') ||
    subject.toLowerCase().includes('carsforsale.com')
  if (!isCarsforsale) return null
  // New Loan App: "Michael Allen", "4065898821", "agoura hills, CA"
  const nameMatch = textBody.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\n\s*(\d{10,11})/m)
    || textBody.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\n\s*[\w.%+-]+@/m)
  const phoneMatch = textBody.match(/(\d{10,11})/) || textBody.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/)
  const cityMatch = textBody.match(/([a-z\s]+,\s*[A-Z]{2})/im)
  const loanMatch = textBody.match(/Loan Amount:\s*(\d+)/i)
  const downMatch = textBody.match(/Down Payment:\s*(\d+)/i)
  const name = nameMatch?.[1]?.trim() || 'Carsforsale Lead'
  const phone = phoneMatch ? (phoneMatch[1] || '').replace(/\D/g, '') : ''
  const comments = [cityMatch?.[0], loanMatch ? `Loan: $${loanMatch[1]}` : null, downMatch ? `Down: $${downMatch[1]}` : null].filter(Boolean).join(', ')
  return {
    name,
    email: '',
    phone: phone.length >= 10 ? phone.slice(-10) : '',
    zip: '',
    vehicle: subject.match(/New Lead[^\w]*([^–-]+)/i)?.[1]?.trim() || subject.match(/(\d{4}\s+[\w\s]+)/)?.[1]?.trim() || '',
    vin: '',
    listed_price: loanMatch ? parseInt(loanMatch[1], 10) : null,
    comments: comments || 'Carsforsale.com lead',
    source: 'carsforsale',
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
  const isFacebook =
    fromEmail.includes('facebookmail.com') ||
    (
      textBody.includes('Facebook Marketplace') &&
      (subject.toLowerCase().includes('interested in your') || subject.toLowerCase().includes('new message about your'))
    ) ||
    (fromEmail.includes('facebookmail.com') && subject.toLowerCase().includes('sent a message'))

  if (!isFacebook) return null

  // Extract buyer name: "X sent a message to the group" or "X is interested" or "X sent you a message"
  const nameMatch =
    subject.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)*) sent a message to the group/i) ||
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
    parseCarGurusPhoneLead(subject, textBody) ||
    parseAutoTraderLead(subject, textBody, fromEmail) ||
    parseKBBLead(subject, textBody, fromEmail) ||
    parseAutolistLead(subject, textBody, fromEmail) ||
    parseCarsforsaleLead(subject, textBody, fromEmail) ||
    parseOfferUpLead(subject, textBody, fromEmail) ||
    parseFacebookMarketplaceLead(subject, textBody, fromEmail) ||
    null
  )
}
