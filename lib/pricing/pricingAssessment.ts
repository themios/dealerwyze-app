/**
 * Shared pricing assessment logic used by VehicleCard, inventory list,
 * and the weekly pricing-check cron job.
 */

export type PricingRating = 'overpriced' | 'high' | 'good' | 'underpriced' | 'no_data'

export interface PricingAssessment {
  rating: PricingRating
  /** Percentage delta from fairMarketPrice. Positive = above market, negative = below. */
  pctDelta: number
  /** Suggested price to show in reports */
  suggestedPrice: number | null
  fairMarketPrice: number | null
  fastSalePrice: number | null
  maxReturnPrice: number | null
  confidence: string | null
  avgDom: number | null
}

interface MarketData {
  fairMarketPrice?: number | null
  fastSalePrice?: number | null
  maxReturnPrice?: number | null
  fmvRangeLow?: number | null
  fmvRangeHigh?: number | null
  confidence?: string | null
  avgDom?: number | null
}

export function assessPricing(
  askingPrice: number | null | undefined,
  marketData: MarketData | null | undefined,
): PricingAssessment {
  const fair = marketData?.fairMarketPrice ?? null
  const fast = marketData?.fastSalePrice ?? null
  const max  = marketData?.maxReturnPrice ?? null

  if (!askingPrice || !fair || !fast || !max) {
    return {
      rating: 'no_data',
      pctDelta: 0,
      suggestedPrice: null,
      fairMarketPrice: fair,
      fastSalePrice: fast,
      maxReturnPrice: max,
      confidence: marketData?.confidence ?? null,
      avgDom: marketData?.avgDom ?? null,
    }
  }

  const pctDelta = ((askingPrice - fair) / fair) * 100

  let rating: PricingRating
  let suggestedPrice: number | null = null

  if (pctDelta > 10) {
    // More than 10% above fair market — will sit indefinitely
    rating = 'overpriced'
    suggestedPrice = Math.round(fair / 100) * 100
  } else if (pctDelta > 5) {
    // 5–10% above fair market — patient seller strategy
    rating = 'high'
    suggestedPrice = null
  } else if (pctDelta < -5) {
    // More than 5% below fair market — leaving money on table
    rating = 'underpriced'
    suggestedPrice = Math.round(fast / 100) * 100
  } else {
    // Within ±5% of fair market — sweet spot
    rating = 'good'
    suggestedPrice = null
  }

  return {
    rating,
    pctDelta,
    suggestedPrice,
    fairMarketPrice: fair,
    fastSalePrice: fast,
    maxReturnPrice: max,
    confidence: marketData?.confidence ?? null,
    avgDom: marketData?.avgDom ?? null,
  }
}

export const RATING_LABEL: Record<PricingRating, string> = {
  overpriced:  'Overpriced',
  high:        'Above Market',
  good:        'Well Priced',
  underpriced: 'Underpriced',
  no_data:     'No market data',
}

export const RATING_COLOR: Record<PricingRating, { bg: string; text: string }> = {
  overpriced:  { bg: 'bg-red-500/10',    text: 'text-red-600' },
  high:        { bg: 'bg-orange-500/10', text: 'text-orange-600' },
  good:        { bg: 'bg-green-500/10',  text: 'text-green-600 dark:text-green-400' },
  underpriced: { bg: 'bg-blue-500/10',   text: 'text-blue-600 dark:text-blue-400' },
  no_data:     { bg: 'bg-muted',         text: 'text-muted-foreground' },
}
