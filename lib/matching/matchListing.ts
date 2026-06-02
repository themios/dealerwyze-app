/**
 * Matching Engine for Buyer Criteria
 *
 * Compares a vehicle listing against a buyer profile to determine if it matches.
 * All comparisons are flexible: NULL criteria fields are skipped (no filter applied).
 * Location matching is forgiving (substring match, case-insensitive).
 */

export interface BuyerProfile {
  id: string;
  buyer_name: string;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  price_min: number | null;
  price_max: number | null;
  sqft_min: number | null;
  sqft_max: number | null;
  location: string | null;
  year_built_min: number | null;
  year_built_max: number | null;
  property_type: string;
  hoa_allowed: boolean;
}

export interface Listing {
  id: string;
  address: string;
  city?: string | null;
  state?: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  hoa_amenities: boolean | null;
  mls_number: string | null; // Identifies MLS listings
}

/**
 * Check if a listing matches a buyer profile
 * Returns true if all specified criteria match; skips NULL criteria
 */
export function matchesProfile(listing: Listing, profile: BuyerProfile): boolean {
  // Bedrooms
  if (profile.bedrooms_min !== null && listing.bedrooms !== null) {
    if (listing.bedrooms < profile.bedrooms_min) return false;
  }
  if (profile.bedrooms_max !== null && listing.bedrooms !== null) {
    if (listing.bedrooms > profile.bedrooms_max) return false;
  }

  // Bathrooms
  if (profile.bathrooms_min !== null && listing.bathrooms !== null) {
    if (listing.bathrooms < profile.bathrooms_min) return false;
  }
  if (profile.bathrooms_max !== null && listing.bathrooms !== null) {
    if (listing.bathrooms > profile.bathrooms_max) return false;
  }

  // Price
  if (profile.price_min !== null && listing.price !== null) {
    if (listing.price < profile.price_min) return false;
  }
  if (profile.price_max !== null && listing.price !== null) {
    if (listing.price > profile.price_max) return false;
  }

  // Sqft
  if (profile.sqft_min !== null && listing.sqft !== null) {
    if (listing.sqft < profile.sqft_min) return false;
  }
  if (profile.sqft_max !== null && listing.sqft !== null) {
    if (listing.sqft > profile.sqft_max) return false;
  }

  // Year Built
  if (profile.year_built_min !== null && listing.year_built !== null) {
    if (listing.year_built < profile.year_built_min) return false;
  }
  if (profile.year_built_max !== null && listing.year_built !== null) {
    if (listing.year_built > profile.year_built_max) return false;
  }

  // Location: match city/state parts (street address alone rarely contains "Austin, TX")
  if (profile.location !== null) {
    const parts = profile.location
      .toLowerCase()
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const haystack = [listing.address, listing.city, listing.state]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();
    if (parts.length > 0 && !parts.every((part) => haystack.includes(part))) {
      return false;
    }
  }

  // Property Type
  if (profile.property_type !== 'any' && listing.property_type !== null) {
    if (!propertyTypesMatch(profile.property_type, listing.property_type)) {
      return false;
    }
  }

  // HOA: if buyer says NO HOA, listing must not have HOA
  if (!profile.hoa_allowed && listing.hoa_amenities === true) {
    return false;
  }

  return true;
}

function propertyTypesMatch(profileType: string, listingType: string): boolean {
  const profileNormalized = profileType.toLowerCase().replace(/_/g, ' ').trim();
  const listingNormalized = listingType.toLowerCase().replace(/_/g, ' ').trim();

  if (listingNormalized.includes(profileNormalized) || profileNormalized.includes(listingNormalized)) {
    return true;
  }

  // MLS feeds often use generic "Residential" for single-family inventory.
  if (listingNormalized === 'residential') {
    return ['single family', 'townhouse', 'condo', 'multi family', 'duplex'].includes(profileNormalized);
  }

  return false;
}
