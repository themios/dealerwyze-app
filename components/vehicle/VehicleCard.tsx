'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Vehicle } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Paperclip, ChevronDown, ChevronUp } from 'lucide-react'
import VehicleQuickUploadSheet from './VehicleQuickUploadSheet'
import { assessPricing, RATING_COLOR } from '@/lib/pricing/pricingAssessment'

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
  vehicle: Vehicle
  reconStatus?: 'red' | 'amber' | 'green'
  investmentSummary?: InvestmentSummary
}

const statusColors: Record<string, string> = {
  available: 'bg-[#2A6B1A]/10 text-[#2A6B1A]',
  pending: 'bg-[#F5A623]/15 text-[#92560A]',
  sold: 'bg-gray-100 text-gray-500',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const RECON_BORDER: Record<string, string> = {
  red:   'border-l-4 border-l-red-500',
  amber: 'border-l-4 border-l-amber-400',
  green: 'border-l-4 border-l-green-500',
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
      <div className={`hover:bg-accent/40 transition-colors ${reconStatus ? RECON_BORDER[reconStatus] : ''}`}
        title={reconStatus ? RECON_LABEL[reconStatus] : undefined}
      >
        {/* Main row */}
        <div className="flex items-center px-4 py-2.5">
          <Link href={`/vehicles/${vehicle.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate leading-snug">
                {vehicleLabel}
                {vehicle.trim && <span className="font-normal text-muted-foreground"> {vehicle.trim}</span>}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="text-[#F07018] font-mono">#{vehicle.stock_no}</span>
                {vehicle.mileage && <span>· {vehicle.mileage.toLocaleString('en-US')} mi</span>}
                {vehicle.color && <span>· {vehicle.color}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                {vehicle.price && (
                  <p className="font-bold text-sm text-[#0D2B55]">{formatCurrency(vehicle.price)}</p>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[vehicle.status]}`}>
                  {vehicle.status}
                </span>
              </div>
              {showPricingBadge && pricing && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${RATING_COLOR[pricing.rating].bg} ${RATING_COLOR[pricing.rating].text}`}
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
          </Link>

          {/* Cost toggle */}
          {hasCostData && (
            <button
              onClick={() => setCostOpen(o => !o)}
              className="ml-2 p-1.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
              title="View cost breakdown"
            >
              {costOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}

          {/* Quick-upload */}
          {!isSold && (
            <button
              onClick={() => setUploadOpen(true)}
              className="ml-1 p-1.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
              title="Attach document"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}
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
