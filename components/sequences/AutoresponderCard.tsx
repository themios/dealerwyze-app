'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, MessageSquare, Play, Pause, X, RotateCcw, Zap } from 'lucide-react'
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
  savingUnsub?:  boolean
  onToggleUnsub?: (field: 'unsubscribe_email' | 'unsubscribe_sms', value: boolean) => void
  autoOverride?:  string | null
  savingAuto?:    boolean
  onSetAutoOverride?: (value: string | null) => void
}

function formatDue(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function AutoresponderCard({ customerId, customerName, unsubEmail = false, unsubSms = false, savingUnsub = false, onToggleUnsub, autoOverride, savingAuto = false, onSetAutoOverride }: Props) {
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
    const entry    = status?.[channel] ?? null
    const unsub    = channel === 'email' ? unsubEmail : unsubSms
    const isActive = entry?.status === 'active'
    const isPaused = entry?.status === 'paused'
    const replied  = isPaused && entry?.stop_reason === 'replied'
    const canStart = !unsub && !isActive && !isPaused
    const unsubField = channel === 'email' ? 'unsubscribe_email' as const : 'unsubscribe_sms' as const
    const Icon   = channel === 'email' ? Mail : MessageSquare
    const label  = channel === 'email' ? 'Email' : 'SMS'

    return (
      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/50">
        {/* Channel label + status */}
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium">{label}</span>
        </div>

        {/* Status badge */}
        <div>
        {unsub ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Opted out</span>
        ) : isActive ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span className="truncate">{entry!.sequence_name}</span>
          </span>
        ) : replied ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            Replied
          </span>
        ) : isPaused ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Paused</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not active</span>
        )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
          {unsub ? (
            <button
              className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
              onClick={() => onToggleUnsub?.(unsubField, false)}
              disabled={savingUnsub}
            >
              Re-enable
            </button>
          ) : (
            <>
              {canStart && (
                <button
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#F07018] hover:bg-[#d4611a] text-white transition-colors"
                  onClick={() => setEnrollChannel(channel)}
                >
                  <Zap className="h-2.5 w-2.5" />Start
                </button>
              )}
              {isActive && entry && (
                <>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                    onClick={() => handleAction(entry.id, 'pause', 'manual')}
                    disabled={acting !== null}
                  >
                    <Pause className="h-2.5 w-2.5 inline mr-0.5" />Pause
                  </button>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-red-300/50 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    onClick={() => handleAction(entry.id, 'cancel', 'manual')}
                    disabled={acting !== null}
                  >
                    <X className="h-2.5 w-2.5 inline mr-0.5" />Stop
                  </button>
                </>
              )}
              {isPaused && entry && !replied && (
                <>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-green-400/50 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                    onClick={() => handleAction(entry.id, 'resume')}
                    disabled={acting !== null}
                  >
                    <Play className="h-2.5 w-2.5 inline mr-0.5" />Resume
                  </button>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-red-300/50 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    onClick={() => handleAction(entry.id, 'cancel', 'manual')}
                    disabled={acting !== null}
                  >
                    <X className="h-2.5 w-2.5 inline mr-0.5" />Stop
                  </button>
                </>
              )}
              {replied && entry && (
                <>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-green-400/50 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                    onClick={() => handleAction(entry.id, 'resume')}
                    disabled={acting !== null}
                  >
                    <Play className="h-2.5 w-2.5 inline mr-0.5" />Resume
                  </button>
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={async () => {
                      await handleAction(entry.id, 'cancel', 'manual')
                      setEnrollChannel(channel)
                    }}
                    disabled={acting !== null}
                  >
                    <RotateCcw className="h-2.5 w-2.5 inline mr-0.5" />New
                  </button>
                </>
              )}
              {onToggleUnsub && (
                <button
                  className="text-[10px] text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50 px-1"
                  onClick={() => onToggleUnsub(unsubField, true)}
                  disabled={savingUnsub}
                >
                  Block
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-l-2 border-[#F07018] pl-2">
            Autoresponder
          </h3>
          {onSetAutoOverride && (
            <div className="flex items-center gap-1">
              {([null, 'manual', 'semi_auto', 'full_auto'] as const).map(mode => (
                <button
                  key={String(mode)}
                  disabled={savingAuto}
                  onClick={() => onSetAutoOverride(mode)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    autoOverride === mode
                      ? 'bg-[#0D2B55] text-white border-[#0D2B55]'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {mode === null ? 'Global' : mode === 'manual' ? 'Off' : mode === 'semi_auto' ? 'Semi' : 'Full'}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-1">
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
