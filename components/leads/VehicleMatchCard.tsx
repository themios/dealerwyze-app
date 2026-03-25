'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, ChevronRight, X } from 'lucide-react'
import { Activity } from '@/types'

interface Props {
  activity: Activity & { customer?: { id: string; name: string; primary_phone?: string | null } | null }
  onUpdate: () => void
}

export default function VehicleMatchCard({ activity, onUpdate }: Props) {
  const [dismissing, setDismissing] = useState(false)

  const customer = activity.customer
  const customerName = customer?.name ?? 'Unknown'

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
            <p className="text-sm font-semibold truncate">{vehicleLine}</p>
            <p className="text-xs text-muted-foreground">Want list match</p>
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
