'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Vehicle } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Paperclip } from 'lucide-react'
import VehicleQuickUploadSheet from './VehicleQuickUploadSheet'
import { assessPricing, RATING_COLOR } from '@/lib/pricing/pricingAssessment'

interface VehicleCardProps {
  vehicle: Vehicle
}

const statusColors: Record<string, string> = {
  available: 'bg-[#2A6B1A]/10 text-[#2A6B1A]',
  pending: 'bg-[#F5A623]/15 text-[#92560A]',
  sold: 'bg-gray-100 text-gray-500',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const isSold = vehicle.status === 'sold'
  const isStaging = vehicle.status === 'staging'
  const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

  const pricing = (!isSold && !isStaging && vehicle.price && vehicle.market_data_json)
    ? assessPricing(vehicle.price, vehicle.market_data_json as Parameters<typeof assessPricing>[1])
    : null

  const showPricingBadge = pricing && pricing.rating !== 'no_data'

  return (
    <>
      <div className="flex items-center px-4 py-2.5 hover:bg-accent/40 transition-colors">
        <Link href={`/vehicles/${vehicle.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-snug">
              {vehicleLabel}
              {vehicle.trim && <span className="font-normal text-muted-foreground"> {vehicle.trim}</span>}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-[#F07018] font-mono">#{vehicle.stock_no}</span>
              {vehicle.mileage && <span>· {vehicle.mileage.toLocaleString()} mi</span>}
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
                  pricing.rating === 'overpriced'  ? 'Action needed: more than 10% above fair market — likely to sit' :
                  pricing.rating === 'high'        ? 'Watch it: 5–10% above fair market — may slow down' :
                  pricing.rating === 'good'        ? 'Well priced: within 5% of fair market' :
                  pricing.rating === 'underpriced' ? 'You could charge more: more than 5% below fair market' : ''
                }
              >
                {pricing.pctDelta > 0 ? '+' : ''}{Math.abs(pricing.pctDelta).toFixed(1)}% {pricing.pctDelta > 0 ? 'above' : 'below'} market
              </span>
            )}
          </div>
        </Link>

        {/* Quick-upload — hidden for sold vehicles */}
        {!isSold && (
          <button
            onClick={() => setUploadOpen(true)}
            className="ml-2 p-1.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
            title="Attach document"
          >
            <Paperclip className="h-4 w-4" />
          </button>
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
