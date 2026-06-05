'use client'

import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'
import type { REMarketIntelligence } from '@/lib/pricing/reListingPricing'

interface CMAPricingCardProps {
  analysis: REMarketIntelligence
}

/**
 * Display 3-tier pricing strategy:
 * 1. Aggressive (quick sale, price discount)
 * 2. Suggested (recommended market price)
 * 3. Premium (strong positioning, price premium)
 */
export default function CMAPricingCard({ analysis }: CMAPricingCardProps) {
  const tiers = [
    {
      name: 'Aggressive',
      subtitle: 'Quick Sale (30-60 days)',
      price: analysis.aggressivePrice,
      color: 'from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-950/10',
      borderColor: 'border-blue-200 dark:border-blue-800',
      badge: 'Discount',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    },
    {
      name: 'Suggested',
      subtitle: 'Market-Competitive (90-120 days)',
      price: analysis.suggestedListPrice,
      color: 'from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-950/10',
      borderColor: 'border-green-200 dark:border-green-800',
      badge: 'Recommended',
      badgeColor: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
      isRecommended: true,
    },
    {
      name: 'Premium',
      subtitle: 'Strong Positioning (150+ days OK)',
      price: analysis.premiumPrice,
      color: 'from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-950/10',
      borderColor: 'border-purple-200 dark:border-purple-800',
      badge: 'Premium',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Header with confidence */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">Pricing Recommendation</h3>
          <p className="text-xs text-muted-foreground">
            Based on {analysis.nComps} comparable sales ({analysis.confidence} confidence)
          </p>
        </div>
        <Badge className="capitalize">{analysis.confidence}</Badge>
      </div>

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiers.map(tier => (
          <div
            key={tier.name}
            className={`relative rounded-lg border ${tier.borderColor} bg-gradient-to-br ${tier.color} p-4 overflow-hidden transition-all ${
              tier.isRecommended ? 'ring-2 ring-primary/30 shadow-lg' : ''
            }`}
          >
            {tier.isRecommended && (
              <div className="absolute top-2 right-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            )}

            <div className="space-y-2">
              {/* Tier name and badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{tier.name}</p>
                  <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${tier.badgeColor}`}>
                  {tier.badge}
                </span>
              </div>

              {/* Price */}
              <div className="pt-2">
                <p className="text-2xl font-bold">
                  {tier.price ? `$${tier.price.toLocaleString()}` : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Price Range Info */}
      {analysis.priceRangeLow && analysis.priceRangeHigh && (
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Range</p>
          <p className="text-sm font-semibold">
            ${analysis.priceRangeLow.toLocaleString()} – $
            {analysis.priceRangeHigh.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}
