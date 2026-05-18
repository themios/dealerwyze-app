'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, ChevronRight, X } from 'lucide-react'
import { Activity } from '@/types'
import { demandSignalShortLabel } from '@/lib/intelligence/demandLabels'

interface Props {
  activity: Activity & {
    customer?: { id: string; name: string; primary_phone?: string | null } | null
    vehicle?: { id?: string | null; demand_signal?: string | null; lead_count_30d?: number } | null
  }
  onUpdate: () => void
}

export default function VehicleMatchCard({ activity, onUpdate }: Props) {
  const [dismissing, setDismissing] = useState(false)

  const customer = activity.customer
  const customerName = customer?.name ?? 'Unknown'
  const vehicleId = activity.vehicle?.id ?? null
  const demandKey = activity.vehicle?.demand_signal ?? null
  const demandLabel = demandKey ? demandSignalShortLabel(demandKey) : null
  const leadCount = activity.vehicle?.lead_count_30d

  // Parse vehicle info and want criteria from activity body
  const bodyLines = (activity.body ?? '').split('\n')
  const vehicleLine = bodyLines.find(l => l.startsWith('Matched vehicle:'))?.replace('Matched vehicle:', '').trim() ?? ''
  const wantLine = bodyLines.find(l => l.startsWith('Want criteria:'))?.replace('Want criteria:', '').trim() ?? ''

  async function dismiss() {
    setDismissing(true)
    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressed_at: new Date().toISOString() }),
    })
    onUpdate()
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bell className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            {vehicleId ? (
              <Link href={`/vehicles/${vehicleId}`} className="text-sm font-semibold truncate hover:underline text-[#0D2B55] dark:text-blue-400">
                {vehicleLine}
              </Link>
            ) : (
              <p className="text-sm font-semibold truncate">{vehicleLine}</p>
            )}
            <p className="text-xs text-muted-foreground">Want list match</p>
            {(demandLabel || (leadCount != null && leadCount > 0)) && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                {demandLabel && <span className="font-medium">{demandLabel}</span>}
                {leadCount != null && leadCount > 0 && (
                  <span className={demandLabel ? ' ml-1' : ''}>· {leadCount} leads (30d)</span>
                )}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={dismiss}
          disabled={dismissing}
          className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-40"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Customer looking for: <span className="font-medium text-foreground">{wantLine || 'see want list'}</span></p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {customer ? (
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1.5 text-sm font-medium text-[#0D2B55] dark:text-blue-400 hover:underline truncate"
          >
            {customerName}
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{customerName}</span>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(activity.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
