'use client'

import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import type { REMarketIntelligence } from '@/lib/pricing/reListingPricing'

interface MarketInsightsSectionProps {
  analysis: REMarketIntelligence
}

/**
 * Display market trend, competition level, and notes.
 * Shows trend arrow (↑ appreciating, ↓ declining, → stable).
 */
export default function MarketInsightsSection({
  analysis,
}: MarketInsightsSectionProps) {
  const getTrendIcon = () => {
    switch (analysis.marketTrend) {
      case 'appreciating':
        return <TrendingUp className="h-5 w-5 text-green-600" />
      case 'declining':
        return <TrendingDown className="h-5 w-5 text-red-600" />
      default:
        return <AlertCircle className="h-5 w-5 text-amber-600" />
    }
  }

  const getTrendLabel = () => {
    switch (analysis.marketTrend) {
      case 'appreciating':
        return 'Market Appreciating'
      case 'declining':
        return 'Market Declining'
      default:
        return 'Market Stable'
    }
  }

  const getCompetitionColor = () => {
    switch (analysis.competitionLevel) {
      case 'low':
        return 'text-green-700 bg-green-50 dark:bg-green-950/30'
      case 'moderate':
        return 'text-amber-700 bg-amber-50 dark:bg-amber-950/30'
      case 'high':
        return 'text-red-700 bg-red-50 dark:bg-red-950/30'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-4">
      {/* Trend */}
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
        {getTrendIcon()}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{getTrendLabel()}</p>
          {analysis.marketTrend === 'appreciating' && (
            <p className="text-xs text-muted-foreground mt-1">
              Recent sales show upward price momentum
            </p>
          )}
          {analysis.marketTrend === 'declining' && (
            <p className="text-xs text-muted-foreground mt-1">
              Market trending down; consider competitive pricing
            </p>
          )}
          {!analysis.marketTrend && (
            <p className="text-xs text-muted-foreground mt-1">
              Market activity stable over recent period
            </p>
          )}
        </div>
      </div>

      {/* Competition & DOM */}
      <div className="grid grid-cols-2 gap-3">
        {/* Competition */}
        <div className={`p-4 rounded-lg border ${getCompetitionColor()}`}>
          <p className="text-xs font-medium uppercase tracking-wide mb-2">
            Competition
          </p>
          <p className="font-semibold text-sm capitalize">
            {analysis.competitionLevel ?? 'Unknown'}
          </p>
          {analysis.totalActive ? (
            <p className="text-xs opacity-75 mt-1">
              {analysis.totalActive} active listings
            </p>
          ) : null}
        </div>

        {/* Days on Market */}
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Avg Days on Market
          </p>
          <p className="font-semibold text-sm">
            {analysis.avgDom ? `${analysis.avgDom} days` : '—'}
          </p>
          {analysis.avgDom ? (
            <p className="text-xs text-muted-foreground mt-1">
              Based on {analysis.nComps ?? 0} comparables
            </p>
          ) : null}
        </div>
      </div>

      {/* Price per sqft */}
      {analysis.pricePerSqft ? (
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Price per Sqft
          </p>
          <div className="flex items-baseline gap-2">
            <p className="font-semibold text-lg">
              ${analysis.pricePerSqft.toFixed(2)}
            </p>
            {analysis.medianPricePerSqft ? (
              <p className="text-xs text-muted-foreground">
                (Market median: ${analysis.medianPricePerSqft.toFixed(2)})
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Notes */}
      {analysis.marketAnalysisReport ? (
        <div className="p-4 rounded-lg border bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Analysis Notes
          </p>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {analysis.marketAnalysisReport}
          </p>
        </div>
      ) : null}
    </div>
  )
}
