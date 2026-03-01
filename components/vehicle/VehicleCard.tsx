import Link from 'next/link'
import { Vehicle } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface VehicleCardProps {
  vehicle: Vehicle
}

const statusColors: Record<string, string> = {
  available: 'bg-[#2A6B1A]/10 text-[#2A6B1A]',
  pending: 'bg-[#F5A623]/15 text-[#92560A]',
  sold: 'bg-gray-100 text-gray-500',
}

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <Link href={`/vehicles/${vehicle.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-snug">
          {vehicle.year} {vehicle.make} {vehicle.model}
          {vehicle.trim && <span className="font-normal text-muted-foreground"> {vehicle.trim}</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-[#F07018] font-mono">#{vehicle.stock_no}</span>
          {vehicle.mileage && <span>· {vehicle.mileage.toLocaleString()} mi</span>}
          {vehicle.color && <span>· {vehicle.color}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {vehicle.price && (
          <p className="font-bold text-sm text-[#0D2B55]">{formatCurrency(vehicle.price)}</p>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[vehicle.status]}`}>
          {vehicle.status}
        </span>
      </div>
    </Link>
  )
}
