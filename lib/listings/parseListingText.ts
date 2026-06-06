/**
 * Parse real estate listing text using simple regex patterns.
 * Handles common MLS/website listing formats.
 */

export interface ParsedListing {
  address?: string
  price?: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  property_type?: string
  year_built?: number
  lot_size?: string
  mls_number?: string
  description?: string
  features?: string
}

export function parseListingText(text: string): ParsedListing {
  const result: ParsedListing = {}

  // Address - look for street address pattern
  const addressMatch = text.match(/(?:Address|Location)[:\s]+([^\n]+(?:CA|California)[^\n]*)/i)
  if (addressMatch) {
    result.address = addressMatch[1].trim().replace(/^\s*[-•]\s*/, '')
  }

  // Price - look for $ followed by numbers
  const priceMatch = text.match(/\$\s*([0-9,]+(?:\.\d{2})?)/i)
  if (priceMatch) {
    result.price = parseInt(priceMatch[1].replace(/,/g, ''), 10)
  }

  // Bedrooms - look for "X bed" or "X bedroom"
  const bedroomsMatch = text.match(/(\d+)\s*(?:bed|bedroom)s?/i)
  if (bedroomsMatch) {
    result.bedrooms = parseInt(bedroomsMatch[1], 10)
  }

  // Bathrooms - look for "X bath" or "X bathroom"
  const bathroomsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?/i)
  if (bathroomsMatch) {
    result.bathrooms = parseFloat(bathroomsMatch[1])
  }

  // Sqft - look for square feet patterns
  const sqftMatch = text.match(/(\d+(?:,\d+)?)\s*(?:sqft|sq\.?\s*ft|square\s*feet|building\s*area)/i)
  if (sqftMatch) {
    result.sqft = parseInt(sqftMatch[1].replace(/,/g, ''), 10)
  }

  // Year built
  const yearMatch = text.match(/(?:year\s*built|built|year)[:\s]+(\d{4})/i)
  if (yearMatch) {
    result.year_built = parseInt(yearMatch[1], 10)
  }

  // Property type - look for common types
  const typeMatch = text.match(/(?:style|type)[:\s]+(single\s*family|ranch|condo|townhouse|mobile|manufactured|farm|commercial|lot)/i)
  if (typeMatch) {
    result.property_type = typeMatch[1].trim()
  }

  // Lot size
  const lotMatch = text.match(/(?:lot\s*size|lot)[:\s]+([0-9.,]+\s*(?:acres?|sqft|sq\.?\s*ft))/i)
  if (lotMatch) {
    result.lot_size = lotMatch[1].trim()
  }

  // MLS number
  const mlsMatch = text.match(/(?:mls\s*#?|mls\s*number)[:\s]+([0-9]+)/i)
  if (mlsMatch) {
    result.mls_number = mlsMatch[1].trim()
  }

  // Description - look for "Property Description" section or similar
  const descMatch = text.match(/(?:property\s*description|description)[:\s]+([^]*?)(?=(?:Price History|General Features|Interior|Exterior|$))/i)
  if (descMatch) {
    const desc = descMatch[1]
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\n+/g, ' ') // Replace line breaks with spaces
      .trim()
      .slice(0, 1000) // Limit to 1000 chars
    if (desc.length > 20) {
      result.description = desc
    }
  }

  return result
}
