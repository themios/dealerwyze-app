# RE Listing Pricing Analysis

AI-powered CMA (Comparative Market Analysis) and 3-tier pricing recommendations for real estate listings.

## Components

### PricingAnalysisButton
Trigger button for pricing analysis modal.
- Shows "Analyze Price" icon + label
- Loading state with spinner during analysis
- Disabled state support

### PricingAnalysisModal
Main modal containing the analysis form and results.

**Form Fields:**
- Property address (required) - text input
- Property type - single_family, condo, townhouse, multi_family
- Bedrooms - numeric input
- Bathrooms - numeric input (supports .5 increments)
- Square footage - numeric input
- Year built - numeric input with validation (1800-current year)
- Condition - excellent, good, fair, poor

**Result Display:**
- Shows loading state while analyzing
- Displays 3-tier pricing card
- Shows market insights section
- Allows "Analyze Another" or "Done" after result

### CMAPricingCard
Display 3-tier pricing recommendation.

**Tiers:**
1. **Aggressive** (Blue)
   - Price discount for quick sale
   - Target: 30-60 days on market
   - Label: "Discount"

2. **Suggested** (Green, Recommended)
   - Market-competitive listing price
   - Target: 90-120 days on market
   - Label: "Recommended" with trending icon
   - Highlighted/scaled on mobile

3. **Premium** (Purple)
   - Strong positioning with price premium
   - Target: 150+ days acceptable
   - Label: "Premium"

**Additional Info:**
- Confidence level badge
- Number of comparables analyzed
- Price range (±5% of suggested)

### MarketInsightsSection
Detailed market analysis display.

**Sections:**
1. **Market Trend**
   - Appreciating (↑ green)
   - Declining (↓ red)
   - Stable (→ amber)

2. **Competition Level**
   - Low (green)
   - Moderate (amber)
   - High (red)
   - Shows active listing count

3. **Days on Market**
   - Average DOM for comparable sales
   - Based on # of comparables

4. **Price per Sqft**
   - Subject property $/sqft
   - Market median $/sqft for comparison

5. **Analysis Notes**
   - Groq-generated market summary
   - Includes methodology and concerns

## Type Definitions

```typescript
interface PricingAnalysisFormData {
  address: string
  propertyType: 'single_family' | 'condo' | 'townhouse' | 'multi_family'
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  condition: 'excellent' | 'good' | 'fair' | 'poor' | null
}

interface REMarketIntelligence {
  suggestedListPrice: number | null
  aggressivePrice: number | null
  premiumPrice: number | null
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
  nComps: number
  priceRangeLow: number | null
  priceRangeHigh: number | null
  medianPricePerSqft: number | null
  avgDom: number | null
  totalActive: number | null
  pricePerSqft: number | null
  sources: string[]
  marketTrend: 'appreciating' | 'stable' | 'declining' | null
  competitionLevel: 'low' | 'moderate' | 'high' | null
  priceReductionOpportunity: boolean
  marketAnalysisReport: string
  checkedAt: string
}
```

## API Route

### POST /api/listings/pricing-analysis

Analyze listing pricing based on property details.

**Request:**
```json
{
  "address": "123 Oak Lane, Pasadena, CA 91101",
  "propertyType": "single_family",
  "bedrooms": 4,
  "bathrooms": 2.5,
  "sqft": 2500,
  "yearBuilt": 2005,
  "condition": "good",
  "property_id": "uuid (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "suggestedListPrice": 850000,
    "aggressivePrice": 782000,
    "premiumPrice": 918000,
    "confidence": "high",
    "nComps": 4,
    "priceRangeLow": 807500,
    "priceRangeHigh": 892500,
    "medianPricePerSqft": 350,
    "avgDom": 45,
    "totalActive": null,
    "pricePerSqft": 340,
    "sources": ["mls_comps", "zillow", "redfin"],
    "marketTrend": "appreciating",
    "competitionLevel": "moderate",
    "priceReductionOpportunity": false,
    "marketAnalysisReport": "# Market Analysis: 123 Oak Lane...",
    "checkedAt": "2026-06-04T12:00:00Z"
  }
}
```

## Integration

### In a Property Listing Page

```tsx
import { useState } from 'react'
import PricingAnalysisButton from '@/components/pricing/PricingAnalysisButton'
import PricingAnalysisModal from '@/components/pricing/PricingAnalysisModal'

export default function PropertyListingPage({ propertyId }: { propertyId: string }) {
  const [analysisOpen, setAnalysisOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">123 Oak Lane</h1>
        <PricingAnalysisButton
          onClick={() => setAnalysisOpen(true)}
        />
      </div>

      {/* Property details */}

      <PricingAnalysisModal
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        propertyId={propertyId}
      />
    </div>
  )
}
```

## Pricing Algorithm

### Tier Calculation
1. **Aggressive Price** = Suggested Price × 0.92 (8% discount)
2. **Suggested Price** = Median of MLS comparables (adjusted for condition)
3. **Premium Price** = Suggested Price × 1.08 (8% premium)

### Confidence Levels
- **High**: 3+ recent comps with similar features
- **Medium**: 1-2 comps or strong online estimates
- **Low**: Limited data
- **Insufficient**: No data available

### Market Trend
- **Appreciating**: Recent sales trending upward
- **Declining**: Recent sales trending downward
- **Stable**: Consistent pricing over time

## Data Sources

Currently using:
- MLS comparables (when provided)
- Zillow estimate (if available)
- Redfin estimate (if available)

### Future Enhancement

Integration with:
- MLS database lookup by address/zip
- Zillow API for automated estimates
- Redfin API for competitive pricing
- Tax assessment records for valuation baseline

## Error Handling

- Missing address: shows validation error
- Invalid property type: rejected at validation
- API failure: returns error message with retry option
- No comparable data: still shows pricing tiers with "insufficient" confidence

## Performance Notes

- Analysis processed via Groq (70B model, ~5 second response time)
- Single request per analysis (no polling)
- 60 second timeout for API route
- Results cached in component state (not persisted)

## Limitations

- Requires property address for search (no fallback to GPS/photos)
- MLS comparables not auto-fetched (stub implementation)
- Competition level estimated, not actual listing count
- Days on market calculated from comps only
- No integration with local market databases yet

## Future Enhancements

1. Auto-fetch MLS comparables by address
2. Integration with Zillow/Redfin APIs
3. Historical price trend analysis
4. Seasonal adjustment factors
5. Neighborhood trend analysis
6. Price reduction recommendations with projected timeline
7. Save analysis history for tracking
8. A/B testing pricing strategies

## Groq Synthesis Prompt

The API route uses `groqREPricingSynthesis()` from `lib/pricing/reListingPricing.ts` to:
1. Analyze provided property details and comparables
2. Generate 3-tier pricing recommendation
3. Assess market conditions and competition
4. Provide methodology notes for transparency
5. Return structured JSON for display

The Groq model used: `llama-3.3-70b-versatile` with temperature 0.2 for consistent outputs.
