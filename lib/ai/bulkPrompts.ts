/**
 * Bulk extraction prompts for vehicle and listing inventory.
 * Vertical-aware: supports dealer vehicles and real estate listings.
 */

/**
 * Build a Gemini extraction prompt for bulk vehicle inventory.
 * Handles AutoTrader listings, Craigslist posts, dealer inventory HTML, etc.
 */
export function buildBulkVehicleExtractionPrompt(content: string): string {
  return `Extract all vehicles from the provided text or HTML (AutoTrader listings, Craigslist posts, dealer inventory HTML, etc.). For each distinct vehicle, return a JSON object with these fields:

- year (required): 4-digit year (e.g., 2023)
- make (required): Vehicle make (e.g., "Toyota")
- model (required): Vehicle model (e.g., "Camry")
- vin (optional): Vehicle Identification Number (typically 17 characters)
- price (optional): Numeric price in dollars (e.g., 28500)
- mileage (optional): Mileage as integer (e.g., 45000)
- color (optional): Exterior color (e.g., "Pearl White", "Midnight Black")
- condition (optional): Condition level: 'excellent', 'good', 'fair', 'poor', or 'unknown'
- description (optional): Any additional notes about the vehicle (interior, features, history)

**Rules:**
- If a vehicle is incomplete (missing year, make, or model), skip it entirely.
- Return ONLY a valid JSON array. Do not include any markdown, explanations, or text outside the JSON.
- Do not wrap the response in code fences. Just the raw JSON array.
- Each object in the array must be a valid vehicle object.
- If no vehicles can be extracted, return an empty array: []

**Input content:**

${content}`
}

/**
 * Build a Gemini extraction prompt for bulk real estate listings.
 * Handles MLS listings, Zillow posts, property portal HTML, etc.
 */
export function buildBulkListingExtractionPrompt(content: string): string {
  return `Extract all real estate listings from the provided text or HTML. For each distinct listing, return a JSON object with these fields:

- address (required): Full street address of the property
- price (optional): Numeric price in dollars (e.g., 250000)
- beds (optional): Number of bedrooms as integer
- baths (optional): Number of bathrooms as integer or decimal
- sqft (optional): Square footage as integer
- property_type (optional): Type like 'single_family', 'condo', 'townhouse', 'land', 'commercial', 'multi_family', etc.
- year_built (optional): 4-digit year the property was built
- lot_size (optional): Lot size as string, e.g. "0.5 acres" or "5000 sq ft"
- mls_number (optional): MLS# or listing ID if present
- description (optional): Any additional notes or features about the property

**Rules:**
- If a listing is incomplete (missing address or cannot be parsed), skip it entirely.
- Return ONLY a valid JSON array. Do not include any markdown, explanations, or text outside the JSON.
- Do not wrap the response in code fences. Just the raw JSON array.
- Each object in the array must be a valid listing object.
- If no listings can be extracted, return an empty array: []

**Input content:**

${content}`
}
