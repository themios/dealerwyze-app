/**
 * OfferUp lead parser.
 * Handles both simple and conversation-thread formats:
 *
 * Simple:
 *   • Tamarah | • 562-250-8277 | • tamarahbenevides@gmail.com
 *   I'd like to set up a time to test drive
 *
 * With thread + vehicle:
 *   Mimi | Active a few hours ago | (79)offer up reviews | Anaheim, CA
 *   [conversation thread with timestamps]
 *   • Mimi | • 6572815707 | • noemiee0819@yahoo.com
 *   I'd like to set up a time to test drive
 *   2009 Acura MDX
 *   $7,495
 */

export interface ParsedOfferUpLead {
  name:     string
  phone:    string | null
  email:    string | null
  note:     string | null   // buyer's most recent message
  vehicle:  string | null   // e.g. "2009 Acura MDX"
}

/** Returns true if the message looks like a forwarded OfferUp lead */
export function isOfferUpLead(text: string): boolean {
  const lower = text.toLowerCase()
  const hasOfferUp = lower.includes('offerup') || lower.includes('offer up')
  // Accept with OR without bullet points — some threads don't include the lead info section
  return hasOfferUp && (text.includes('•') || /\(\d+\)\s*offer up reviews/i.test(text))
}

/** Extract all structured fields from an OfferUp lead notification */
export function parseOfferUpLead(text: string): ParsedOfferUpLead | null {
  const lines = text.split('\n').map(l => l.trim())

  // ── Bullets: name / phone / email ─────────────────────────────────────────
  const bulletLines = lines
    .filter(l => l.startsWith('•'))
    .map(l => l.replace(/^•\s*/, '').trim())

  const phoneRe = /^[\d\s().+-]{7,}$/
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  let name:  string | null = null
  let phone: string | null = null
  let email: string | null = null

  if (bulletLines.length > 0) {
    // Structured lead info section present
    for (const line of bulletLines) {
      if (emailRe.test(line)) {
        email = line
      } else if (phoneRe.test(line)) {
        const digits = line.replace(/\D/g, '')
        const norm = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
        phone = norm.length === 10 ? norm : null
      } else if (!name) {
        name = line
      }
    }
  } else {
    // No bullets — name is the first non-empty line (before metadata like "Active...")
    const metaRe = /^(active |message\.\.\.|no file chosen|\d{1,2}:\d{2}|seen$|\(\d+\))/i
    name = lines.find(l => l.length > 0 && l.length < 40 && !metaRe.test(l)) ?? null
  }

  if (!name) return null

  // ── Vehicle: year + make/model near a price line ──────────────────────────
  const vehicleRe = /\b(19|20)\d{2}\s+[A-Za-z][a-zA-Z\-]+(?:\s+[A-Za-z][a-zA-Z\-]+){0,3}\b/
  const priceRe   = /^\$[\d,]+$/

  let vehicle: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(vehicleRe)
    if (match) {
      // Confirm context: adjacent line is a price OR it's at the end of the message
      const prevLine = lines[i - 1] ?? ''
      const nextLine = lines[i + 1] ?? ''
      if (priceRe.test(nextLine) || priceRe.test(prevLine) || i >= lines.length - 4) {
        vehicle = match[0].trim()
        break
      }
    }
  }

  // ── Buyer note: collect buyer messages from conversation thread ───────────
  // Skip: timestamps, metadata headers, dealer replies ("- Tim"), price lines,
  //       vehicle lines, "Seen", "Message...", "No file chosen", bullet lines
  const skipRe = /^(\d{1,2}:\d{2}|lead info|lead information|active |offer up|offerup|\d{1,3}\s*(offer up|offerup)|\w+,\s*(CA|TX|NY|FL|AZ)|ready to buy|seen|message\.\.\.|no file chosen)/i
  const dealerReplyRe = /[-–]\s*Tim\s*$/i

  const buyerMessages = lines.filter(l =>
    l.length > 3 &&
    !l.startsWith('•') &&
    !skipRe.test(l) &&
    !dealerReplyRe.test(l) &&
    !priceRe.test(l) &&
    !vehicleRe.test(l) &&
    // skip "Activating the button..." tooltip text
    !l.toLowerCase().startsWith('activating')
  )

  // Most recent buyer message = last candidate (OfferUp thread is reverse-chron at top)
  // But the standard inquiry line is usually near the bottom, so take the last one
  const note = buyerMessages.length > 0 ? buyerMessages[buyerMessages.length - 1] : null

  return { name, phone, email, note, vehicle }
}
