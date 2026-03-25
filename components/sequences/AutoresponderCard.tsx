'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, MessageSquare, Play, Pause, X, RotateCcw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EnrollSheet from './EnrollSheet'

interface EnrollmentEntry {
  id: string
  status: 'active' | 'paused'
  channel: 'email' | 'sms'
  sequence_id: string
  sequence_name: string
  stop_reason: string | null
  stopped_at: string | null
  next_step_due: string | null
}

interface ChannelStatus {
  email: EnrollmentEntry | null
  sms:   EnrollmentEntry | null
}

interface Props {
  customerId:    string
  customerName:  string
  unsubEmail?:   boolean
  unsubSms?:     boolean
}

function formatDue(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function StatusBadge({ entry, unsub }: { entry: EnrollmentEntry | null; unsub: boolean }) {
  if (unsub) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Opted out</span>
  }
  if (!entry) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not active</span>
  }
  if (entry.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Active - {entry.sequence_name}
      </span>
    )
  }
  if (entry.status === 'paused' && entry.stop_reason === 'replied') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Customer replied
      </span>
    )
  }
  if (entry.status === 'paused') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Paused - {entry.sequence_name}</span>
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not active</span>
}

export default function AutoresponderCard({ customerId, customerName, unsubEmail = false, unsubSms = false }: Props) {
  const [status, setStatus]     = useState<ChannelStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [acting, setActing]     = useState<string | null>(null)
  const [enrollChannel, setEnrollChannel] = useState<'email' | 'sms' | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customer-sequences?customer_id=${customerId}`)
      if (res.ok) {
        const data = await res.json() as ChannelStatus
        setStatus(data)
      }
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  async function handleAction(enrollmentId: string, action: 'pause' | 'resume' | 'cancel', stopReason?: string) {
    setActing(action + enrollmentId)
    const statusMap = { pause: 'paused', resume: 'active', cancel: 'cancelled' } as const
    await fetch(`/api/customer-sequences/${enrollmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: statusMap[action],
        ...(stopReason ? { stop_reason: stopReason } : {}),
      }),
    })
    setActing(null)
    await fetchStatus()
  }

  function ChannelRow({ channel }: { channel: 'email' | 'sms' }) {
    const entry  = status?.[channel] ?? null
    const unsub  = channel === 'email' ? unsubEmail : unsubSms
    const isActive = entry?.status === 'active'
    const isPaused = entry?.status === 'paused'
    const replied  = isPaused && entry?.stop_reason === 'replied'

    const Icon = channel === 'email' ? Mail : MessageSquare
    const label = channel === 'email' ? 'Email' : 'SMS'
    const canStart = !unsub && !isActive && !isPaused

    return (
      <div className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <StatusBadge entry={entry} unsub={unsub} />
        </div>

        {/* Next step due */}
        {entry && (isActive || isPaused) && entry.next_step_due && (
          <p className="text-xs text-muted-foreground ml-6">
            {isActive ? 'Next send:' : 'Was due:'} {formatDue(entry.next_step_due)}
          </p>
        )}

        {/* Reply takeover alert */}
        {replied && (
          <div className="ml-6 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5 font-medium">
            <span>Customer replied - review and take over the conversation.</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="ml-6 flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
          {canStart && (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-[#F07018] hover:bg-[#d4611a] text-white"
              onClick={() => setEnrollChannel(channel)}
            >
              <Zap className="h-3 w-3" />
              Start autoresponder
            </Button>
          )}

          {isActive && entry && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAction(entry.id, 'pause', 'manual')}
                disabled={acting !== null}
              >
                <Pause className="h-3 w-3" />
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 text-destructive border-destructive/30"
                onClick={() => handleAction(entry.id, 'cancel', 'manual')}
                disabled={acting !== null}
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
            </>
          )}

          {isPaused && entry && !replied && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAction(entry.id, 'resume')}
                disabled={acting !== null}
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 text-destructive border-destructive/30"
                onClick={() => handleAction(entry.id, 'cancel', 'manual')}
                disabled={acting !== null}
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
            </>
          )}

          {/* After reply: offer resume (same campaign) or restart (new campaign) */}
          {replied && entry && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAction(entry.id, 'resume')}
                disabled={acting !== null}
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={async () => {
                  // Cancel current, then open enroll sheet to pick a new campaign
                  await handleAction(entry.id, 'cancel', 'manual')
                  setEnrollChannel(channel)
                }}
                disabled={acting !== null}
              >
                <RotateCcw className="h-3 w-3" />
                Restart with new
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-l-2 border-[#F07018] pl-2 mb-1">
          Autoresponder
        </h3>
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : (
          <div className="divide-y">
            <ChannelRow channel="email" />
            <ChannelRow channel="sms" />
          </div>
        )}
      </div>

      <EnrollSheet
        customerId={customerId}
        customerName={customerName}
        channel={enrollChannel ?? 'email'}
        open={enrollChannel !== null}
        onOpenChange={open => { if (!open) setEnrollChannel(null) }}
        onEnrolled={() => { setEnrollChannel(null); void fetchStatus() }}
      />
    </>
  )
}
