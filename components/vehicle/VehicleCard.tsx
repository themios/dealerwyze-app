'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Vehicle } from '@/types'
import type { InterestLevel } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Paperclip, ChevronDown, ChevronUp, ChevronRight, Flame } from 'lucide-react'
import VehicleQuickUploadSheet from './VehicleQuickUploadSheet'
import { assessPricing, RATING_COLOR } from '@/lib/pricing/pricingAssessment'
import { demandSignalShortLabel } from '@/lib/intelligence/demandLabels'

interface InvestmentSummary {
  purchase_price: number | null
  recon_total: number
  ledger_total: number
  flooring_fee: number
  floor_plan_interest: number
  total_investment: number | null
  list_price: number | null
  sold_price: number | null
}

interface VehicleCardProps {
  vehicle: Vehicle & { lead_rating?: InterestLevel | null }
  reconStatus?: 'red' | 'amber' | 'green'
  investmentSummary?: InvestmentSummary
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  sold: 'bg-muted text-muted-foreground',
  staging: 'bg-indigo-100 text-indigo-700',
}

const RECON_BG: Record<string, string> = {
  red:   'bg-red-500/10 border-red-500/30',
  amber: 'bg-amber-500/10 border-amber-500/30',
  green: 'bg-green-500/10 border-green-500/30',
}

const RECON_LABEL: Record<string, string> = {
  red:   'Safety items needed',
  amber: 'Recon in progress',
  green: 'Recon complete',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function ProfitRow({ label, value, profit }: { label: string; value: string; profit?: boolean }) {
  return (
    <div className={`flex justify-between text-xs ${profit ? (value.startsWith('-') || value === '—' ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold') : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function VehicleCard({ vehicle, reconStatus, investmentSummary }: VehicleCardProps) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [costOpen, setCostOpen] = useState(false)

  const isSold = vehicle.status === 'sold'
  const isStaging = vehicle.status === 'staging'
  const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

  const pricing = (!isSold && !isStaging && vehicle.price && vehicle.market_data_json)
    ? assessPricing(vehicle.price, vehicle.market_data_json as Parameters<typeof assessPricing>[1])
    : null
  const showPricingBadge = pricing && pricing.rating !== 'no_data'

  const hasCostData = investmentSummary && (
    investmentSummary.purchase_price != null || investmentSummary.total_investment != null
  )

  const profit = investmentSummary
    ? isSold
      ? (investmentSummary.sold_price != null && investmentSummary.total_investment != null
          ? investmentSummary.sold_price - investmentSummary.total_investment
          : null)
      : (investmentSummary.list_price != null && investmentSummary.total_investment != null
          ? investmentSummary.list_price - investmentSummary.total_investment
          : null)
    : null

  return (
    <>
      <div
        className={`bg-card border border-border rounded-[10px] mx-3 my-2 overflow-hidden transition-colors
          ${reconStatus ? RECON_BG[reconStatus] : ''}
          ${isSold ? 'opacity-65' : ''}
        `}
        title={reconStatus ? RECON_LABEL[reconStatus] : undefined}
      >
        {/* Main row */}
        <div className="flex items-center p-4 gap-3 hover:bg-muted/50 transition-colors cursor-pointer">

          {/* Info */}
          <Link href={`/vehicles/${vehicle.id}`} className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate leading-snug">
                  {vehicleLabel}
                  {vehicle.trim && <span className="font-normal text-muted-foreground"> {vehicle.trim}</span>}
                </p>
                {/* Line 2: mileage · price · status badge */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {vehicle.mileage && <span className="text-sm text-muted-foreground">{vehicle.mileage.toLocaleString('en-US')} mi</span>}
                  {vehicle.price && (
                    <span className="text-sm font-semibold text-[#F07018]">{formatCurrency(vehicle.price)}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusColors[vehicle.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {vehicle.status}
                  </span>
                  {vehicle.lead_rating === 'hot' && (
                    <span className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700">
                      <Flame className="h-3 w-3" />Hot
                    </span>
                  )}
                  {!isSold && !isStaging && vehicle.demand_signal && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/50">
                      {demandSignalShortLabel(vehicle.demand_signal)}
                    </span>
                  )}
                  {!isSold && !isStaging && !vehicle.demand_signal && (vehicle.lead_count_30d ?? 0) > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                      {vehicle.lead_count_30d} leads (30d)
                    </span>
                  )}
                </div>
                {showPricingBadge && pricing && (
                  <span
                    className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${RATING_COLOR[pricing.rating].bg} ${RATING_COLOR[pricing.rating].text}`}
                    title={
                      pricing.rating === 'overpriced'  ? 'Action needed: more than 10% above fair market' :
                      pricing.rating === 'high'        ? 'Watch it: 5-10% above fair market' :
                      pricing.rating === 'good'        ? 'Well priced: within 5% of fair market' :
                      pricing.rating === 'underpriced' ? 'You could charge more: more than 5% below fair market' : ''
                    }
                  >
                    {pricing.pctDelta > 0 ? '+' : ''}{Math.abs(pricing.pctDelta).toFixed(1)}% {pricing.pctDelta > 0 ? 'above' : 'below'} market
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Cost toggle */}
            {hasCostData && (
              <button
                onClick={() => setCostOpen(o => !o)}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                title="View cost breakdown"
              >
                {costOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}

            {/* Quick-upload */}
            {!isSold && (
              <button
                onClick={() => setUploadOpen(true)}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                title="Attach document"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}

            <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
          </div>
        </div>

        {/* Cost breakdown panel */}
        {costOpen && hasCostData && investmentSummary && (
          <div className="px-4 pb-3 pt-1 border-t bg-muted/30 space-y-1">
            <ProfitRow label="Purchase Price" value={fmt(investmentSummary.purchase_price)} />
            {isStaging && investmentSummary.recon_total > 0 && (
              <ProfitRow label="Recon Costs" value={fmt(investmentSummary.recon_total)} />
            )}
            {isStaging && investmentSummary.ledger_total > 0 && (
              <ProfitRow label="Other Expenses" value={fmt(investmentSummary.ledger_total)} />
            )}
            {investmentSummary.flooring_fee > 0 && (
              <ProfitRow label="Flooring Fee" value={fmt(investmentSummary.flooring_fee)} />
            )}
            {investmentSummary.floor_plan_interest > 0 && (
              <ProfitRow label="Floor Plan Interest" value={fmt(investmentSummary.floor_plan_interest)} />
            )}
            {investmentSummary.total_investment != null && (
              <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                <span>Total Investment</span>
                <span>{fmt(investmentSummary.total_investment)}</span>
              </div>
            )}
            {isSold ? (
              <>
                <ProfitRow label="Sale Price" value={fmt(investmentSummary.sold_price)} />
                <ProfitRow label="Gross Profit" value={fmt(profit)} profit />
              </>
            ) : (
              <>
                <ProfitRow label="List Price" value={fmt(investmentSummary.list_price)} />
                <ProfitRow label="Est. Profit" value={fmt(profit)} profit />
              </>
            )}
          </div>
        )}
      </div>

      <VehicleQuickUploadSheet
        vehicleId={vehicle.id}
        vehicleLabel={vehicleLabel}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </>
  )
}
