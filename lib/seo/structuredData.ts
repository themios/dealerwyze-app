/**
 * lib/seo/structuredData.ts
 *
 * Generate Schema.org structured data for listing pages
 * Helps search engines understand property details
 */

export interface RealEstateItemData {
  name: string
  address: string
  price: number | null
  priceCurrency?: string
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  image?: string
  description?: string
  url: string
  propertyType?: string
}

/**
 * Generate RealEstateItem (Schema.org) structured data for a listing
 */
export function generateRealEstateItemSchema(data: RealEstateItemData) {
  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'RealEstateProperty',
    name: data.name,
    description: data.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: data.address,
    },
    image: data.image,
    offers: {
      '@type': 'Offer',
      price: data.price?.toString() ?? 'Call for price',
      priceCurrency: data.priceCurrency ?? 'USD',
    },
    url: data.url,
  } as Record<string, unknown>

  // Add optional fields if available
  if (data.bedrooms != null) schema.numberOfBedrooms = data.bedrooms
  if (data.bathrooms != null) schema.numberOfBathrooms = data.bathrooms
  if (data.sqft) {
    schema.floorSize = {
      '@type': 'QuantitativeValue',
      value: data.sqft,
      unitCode: 'FTK',
    }
  }
  if (data.propertyType) schema.propertyType = data.propertyType

  return schema
}

/**
 * Generate breadcrumb Schema.org structured data
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * Generate Organization schema for website footer
 */
export function generateOrganizationSchema(orgName: string, website: string, contactEmail?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: orgName,
    url: website,
    email: contactEmail,
  }
}
