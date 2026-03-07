'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime, formatPhoneForTel, lastContactBadge } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Phone, MessageSquare, CheckSquare } from 'lucide-react'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'

interface WaitingItemProps {
  activity: Activity
  onUpdate: () => void
}

export default function WaitingItem({ activity, onUpdate }: WaitingItemProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()
  const openCustomer = useOpenCustomer()
  const customer = activity.customer

  async function markDone() {
    setLoading('done')
    await supabase.from('activities').update({ completed_at: new Date().toISOString() }).eq('id', activity.id)
    onUpdate()
    setLoading(null)
  }

  const typeLabel = activity.type === 'sms' ? 'Texted' : activity.type === 'call' ? 'Called' : 'Emailed'

  const handleCardClick = () => {
    if (customer?.id) openCustomer(activity.id, customer.id)
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div
        className="flex items-start justify-between gap-2 cursor-pointer hover:opacity-90"
        onClick={handleCardClick}
        onKeyDown={e => e.key === 'Enter' && handleCardClick()}
        role="button"
        tabIndex={0}
        aria-label={`Open ${customer?.name ?? 'customer'}`}
      >
        <div className="flex-1 min-w-0">
          {customer ? (
            <p className="font-medium text-sm">{customer.name}</p>
          ) : (
            <p className="font-medium text-sm">Unknown customer</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
            {typeLabel} {formatRelativeTime(activity.created_at)} — no reply
          </p>
          {activity.body && (
            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">"{activity.body}"</p>
          )}
        </div>
        {(() => { const b = lastContactBadge(activity.created_at); return (
          <span suppressHydrationWarning className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${b.cls}`}>
            {b.label}
          </span>
        )})()}
      </div>

      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        {customer && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9"
              onClick={() => {
                window.location.href = `tel:${formatPhoneForTel(customer.primary_phone)}`
              }}
            >
              <Phone className="h-3.5 w-3.5 mr-1" /> Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9"
              onClick={() => {
                window.location.href = `sms:${formatPhoneForTel(customer.primary_phone)}`
              }}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Text
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="default"
          className="flex-1 h-9"
          onClick={markDone}
          disabled={loading !== null}
        >
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          {loading === 'done' ? '…' : 'Done'}
        </Button>
      </div>
    </div>
  )
}
