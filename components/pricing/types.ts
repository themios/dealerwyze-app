/**
 * Type definitions for RE listing pricing analysis.
 * Exported so client components can import without server deps.
 */

import type { REMarketIntelligence } from '@/lib/pricing/reListingPricing'

export interface PricingAnalysisFormData {
  address: string
  propertyType: 'single_family' | 'condo' | 'townhouse' | 'multi_family'
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  condition: 'excellent' | 'good' | 'fair' | 'poor' | null
}

export interface MarketComparable {
  address: string
  price: number
  beds: number
  baths: number
  sqft: number
  soldDate: string
}

export interface PricingAnalysisResponse {
  success: boolean
  analysis: REMarketIntelligence | null
  error?: string
}

export const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi_family', label: 'Multi-Family' },
] as const

export const CONDITIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
] as const
