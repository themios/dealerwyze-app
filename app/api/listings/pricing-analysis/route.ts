import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { analyzeREListingPricing, type REListingPricingInput } from '@/lib/pricing/reListingPricing'
import type { PricingAnalysisResponse } from '@/components/pricing/types'

export const maxDuration = 60

/**
 * POST /api/listings/pricing-analysis
 *
 * Analyze RE listing pricing based on property details and comparable sales.
 * Routes to analyzeREListingPricing() and returns 3-tier pricing recommendation.
 *
 * Request body:
 * {
 *   address: string
 *   propertyType: 'single_family' | 'condo' | 'townhouse' | 'multi_family'
 *   bedrooms: number | null
 *   bathrooms: number | null
 *   sqft: number | null
 *   yearBuilt: number | null
 *   condition: 'excellent' | 'good' | 'fair' | 'poor' | null
 *   property_id?: string (optional, for context)
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   analysis: REMarketIntelligence | null
 *   error?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireProfile()

    const body = await req.json() as {
      address: string
      propertyType: string
      bedrooms: number | null
      bathrooms: number | null
      sqft: number | null
      yearBuilt: number | null
      condition: string | null
      property_id?: string
    }

    const {
      address,
      propertyType,
      bedrooms,
      bathrooms,
      sqft,
      yearBuilt,
      condition,
    } = body

    // Validate required fields
    if (!address || address.trim().length === 0) {
      return NextResponse.json(
        { success: false, analysis: null, error: 'Property address is required' },
        { status: 400 }
      )
    }

    // Validate property type
    const validPropertyTypes = ['single_family', 'condo', 'townhouse', 'multi_family']
    if (!validPropertyTypes.includes(propertyType)) {
      return NextResponse.json(
        {
          success: false,
          analysis: null,
          error: `Invalid property type. Must be one of: ${validPropertyTypes.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate condition (if provided)
    if (condition) {
      const validConditions = ['excellent', 'good', 'fair', 'poor']
      if (!validConditions.includes(condition)) {
        return NextResponse.json(
          {
            success: false,
            analysis: null,
            error: `Invalid condition. Must be one of: ${validConditions.join(', ')}`,
          },
          { status: 400 }
        )
      }
    }

    // Build analysis input
    // Note: In a real implementation, you'd fetch MLS comparables here
    // For now, we use empty comparables and let Groq synthesize based on address/details
    const analysisInput: REListingPricingInput = {
      address: address.trim(),
      propertyType: propertyType as 'single_family' | 'condo' | 'townhouse' | 'multi_family',
      bedrooms,
      bathrooms,
      sqft,
      lotSize: null,
      yearBuilt,
      condition: condition as 'excellent' | 'good' | 'fair' | 'poor' | null,
      recentRemodels: [],
      mlsComps: [], // Would be populated from MLS API in production
      zillowEstimate: null,
      redfInEstimate: null,
    }

    // Analyze with Groq synthesis
    const analysis = await analyzeREListingPricing(analysisInput)

    const response: PricingAnalysisResponse = {
      success: true,
      analysis,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[listings/pricing-analysis] error:', err)
    return NextResponse.json(
      {
        success: false,
        analysis: null,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}
