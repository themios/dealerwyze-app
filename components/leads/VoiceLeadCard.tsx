'use client'

import { useState } from 'react'
import { VoiceCall } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Phone, Car, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface VoiceLeadCardProps {
  call: VoiceCall
  onUpdate: () => void
}

/** Format raw E.164 or 10-digit to (NXX) NXX-XXXX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  return raw
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function VoiceLeadCard({ call, onUpdate }: VoiceLeadCardProps) {
  const [loading, setLoading] = useState<'call' | 'dismiss' | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const summary    = call.summary_json
  const callerName = summary?.caller_name || call.customer?.name || formatPhone(call.from_number)
  const vehicle    = summary?.vehicle_interest || null
  const timeline   = summary?.appointment_exact || summary?.appointment_range || null
  const phone      = formatPhone(call.from_number)
  const duration   = formatDuration(call.duration_seconds)

  async function handleCallBack() {
    setLoading('call')

    // Log outbound call activity
    if (call.customer_id) {
      const orgId = process.env.NEXT_PUBLIC_SUPABASE_URL ? undefined : undefined // RLS handles user
      supabase.from('activities').insert({
        customer_id: call.customer_id,
        type:        'call',
        direction:   'outbound',
        outcome:     'pending',
        priority:    'high',
        body:        `Call back re: ${vehicle || 'inquiry'} (voice lead)`,
      }).then(() => {})
    }

    // Complete linked task
    if (call.task_id) {
      supabase.from('tasks').update({
        status:       'done',
        completed_at: new Date().toISOString(),
      }).eq('id', call.task_id).then(() => {})
    }

    // Open native dialer
    window.location.href = `tel:${call.from_number}`

    setLoading(null)
    onUpdate()
  }

  async function handleDismiss() {
    setLoading('dismiss')

    if (call.task_id) {
      // Complete linked task — TodayContent filters out calls with done tasks
      await supabase.from('tasks').update({
        status:       'done',
        completed_at: new Date().toISOString(),
      }).eq('id', call.task_id)
    } else {
      // No task: mark the voice call itself as handled so it stops showing
      await supabase.from('voice_calls').update({ status: 'too_short' }).eq('id', call.id)
    }

    setLoading(null)
    onUpdate()
  }

  const handleCardClick = () => {
    if (call.customer_id) router.push(`/customers/${call.customer_id}`)
  }

  return (
    <div className="rounded-lg border-2 border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div
        className="flex items-start gap-2 cursor-pointer hover:opacity-90"
        onClick={handleCardClick}
        onKeyDown={e => e.key === 'Enter' && handleCardClick()}
        role={call.customer_id ? 'button' : undefined}
        tabIndex={call.customer_id ? 0 : undefined}
        aria-label={call.customer_id ? `Open ${callerName}` : undefined}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-600 bg-orange-500/10">
              Missed Call
            </Badge>
            {duration && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {duration}
              </span>
            )}
          </div>

          <p className="font-semibold text-sm">{callerName}</p>

          {vehicle && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <Car className="h-3 w-3" />
              {vehicle}
            </p>
          )}
        </div>

        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-orange-500/10 text-orange-600">
          Voice
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
        <p className="flex items-center gap-1.5">
          <Phone className="h-3 w-3" />
          <a href={`tel:${call.from_number}`} className="text-primary underline">{phone}</a>
        </p>
        {timeline && (
          <p className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {timeline}
          </p>
        )}
      </div>

      {summary?.additional_notes && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-orange-500/30 pl-2">
          {summary.additional_notes}
        </p>
      )}

      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <Button
          size="lg"
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleCallBack}
          disabled={loading !== null}
        >
          <Phone className="h-4 w-4 mr-2" />
          {loading === 'call' ? 'Calling…' : 'Call Back'}
        </Button>
      </div>

      <div className="flex justify-end">
        <button
          className="text-xs text-muted-foreground hover:text-foreground py-1"
          onClick={handleDismiss}
          disabled={loading !== null}
        >
          {loading === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </div>
  )
}
