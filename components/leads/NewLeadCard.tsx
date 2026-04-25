'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { tomorrow8am, leadAgeBadge, leadIsStale } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, MapPin, Car, Pause, X, ChevronDown, Zap, CalendarPlus, Check, Pencil, MessageSquare } from 'lucide-react'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'
import UnsubscribeBadge from '@/components/sequences/UnsubscribeBadge'

const SOURCE_LABELS: Record<string, string> = {
  cargurus: 'CarGurus',
  autotrader: 'AutoTrader',
  offerup: 'OfferUp',
  cargurus_digest: 'CarGurus Digest',
  facebook: 'Facebook',
  kbb: 'KBB',
  autolist: 'Autolist',
  carsforsale: 'Carsforsale.com',
}

export interface SequenceStatus {
  id: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  sequence_name: string
  next_step_due?: string | null
  step_number?: number | null
  step_total?: number | null
}

interface NewLeadCardProps {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string; email?: string; sms_opt_out?: boolean; unsubscribe_email?: boolean; unsubscribe_sms?: boolean }
  }
  onUpdate: () => void
  onAddressed?: () => void   // optimistic: called immediately when card is opened or marked done
  hasResponded?: boolean
  sequenceStatus?: SequenceStatus | null
}

function parseLead(body: string) {
  const lines = body.split('\n')
  const get = (prefix: string) => lines.find(l => l.startsWith(prefix))?.replace(prefix, '').trim() || ''
  return {
    phone: get('Phone:'),
    zip: get('ZIP:'),
    vehicleLine: get('Vehicle:'),
    vin: get('VIN:'),
    comments: lines.slice(lines.findIndex(l => l.startsWith('"'))).join('\n').replace(/^"|"$/g, '').trim(),
  }
}

function parseYearMakeModel(vehicleLine: string): { year: number; make: string; model: string } | null {
  const trimmed = vehicleLine.split(' — ')[0].trim()
  const match = trimmed.match(/^((?:19|20)\d{2})\s+(\S+)\s+(.+)$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const make = match[2].trim()
  const model = match[3].trim()
  return year && make && model ? { year, make, model } : null
}

function scoreLeadActivity(activity: Activity & { customer: { email?: string; primary_phone: string } }, lead: ReturnType<typeof parseLead>): number {
  let score = 0
  if (activity.customer.primary_phone) score += 2
  if (activity.customer.email) score += 2
  if (lead.comments && lead.comments.length > 10) score += 2
  if (lead.vehicleLine) score += 1
  if (lead.zip) score += 1
  if (lead.comments && lead.comments.length > 100) score += 1
  if (lead.vehicleLine.includes('$') || lead.vehicleLine.includes('—')) score += 1
  return Math.min(score, 10)
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? 'bg-orange-500/10 text-orange-600' : score >= 4 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-muted text-muted-foreground'
  const label = score >= 7 ? 'Hot' : score >= 4 ? 'Warm' : 'Cold'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NewLeadCard({ activity, onUpdate, onAddressed, hasResponded, sequenceStatus }: NewLeadCardProps) {
  const lead = parseLead(activity.body || '')

  const [loading, setLoading] = useState<string | null>(null)
  const [snoozeExpanded, setSnoozeExpanded] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('10:00')
  const [apptSaved, setApptSaved] = useState(false)
  const openCustomer = useOpenCustomer()

  const customer = activity.customer
  const stale = leadIsStale(activity.created_at)
  const firstName = customer.name.split(' ')[0]
  const vehicleParts = lead.vehicleLine.split(' — ')
  const vehicleName = vehicleParts[0]
  const priceStr = vehicleParts[1] || ''
  const score = scoreLeadActivity(activity as any, lead)

  const sourceLabel = SOURCE_LABELS[(activity as any).customer?.lead_source ?? ''] ?? 'Web'
  const rawSource = (activity as any).customer?.lead_source ?? ''
  const sourceBadgeClass = (() => {
    if (rawSource === 'sms' || rawSource === 'text') return 'bg-blue-50 text-blue-700'
    if (rawSource === 'email') return 'bg-purple-50 text-purple-700'
    if (rawSource === 'phone' || rawSource === 'call') return 'bg-green-50 text-green-700'
    return 'bg-accent text-accent-foreground' // default: web/marketplace amber tint
  })()

  const unsubEmail = customer.unsubscribe_email ?? false
  const unsubSms = customer.unsubscribe_sms ?? false

  async function handleSequenceAction(action: 'pause' | 'resume' | 'cancel') {
    if (!sequenceStatus) return
    setLoading(action)
    const statusMap = { pause: 'paused', resume: 'active', cancel: 'cancelled' } as const
    await fetch(`/api/customer-sequences/${sequenceStatus.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusMap[action] }),
    })
    setLoading(null)
    onUpdate()
  }

  async function handleSnooze(isoDate: string) {
    setLoading('snooze')
    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozed_until: isoDate }),
    })
    setLoading(null)
    setSnoozeExpanded(false)
    onUpdate()
  }

  function snoozePreset(preset: 'tomorrow' | '3days' | '1week' | '2weeks'): string {
    const d = new Date()
    if (preset === 'tomorrow') d.setDate(d.getDate() + 1)
    if (preset === '3days')    d.setDate(d.getDate() + 3)
    if (preset === '1week')    d.setDate(d.getDate() + 7)
    if (preset === '2weeks')   d.setDate(d.getDate() + 14)
    d.setHours(8, 0, 0, 0)
    return d.toISOString()
  }

  async function handleSaveAppt() {
    if (!apptDate) return
    setLoading('appt')
    const dueAt = new Date(`${apptDate}T${apptTime}:00`).toISOString()
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'appointment',
        customer_id: customer.id,
        due_at: dueAt,
        direction: 'outbound',
        outcome: 'scheduled',
        priority: 'high',
        body: `Appointment${vehicleName ? ` re: ${vehicleName}` : ''}`,
      }),
    })
    setLoading(null)
    setApptOpen(false)
    setApptSaved(true)
    onUpdate()
  }

  const handleCardClick = () => {
    onAddressed?.()       // optimistically remove from Today list immediately
    openCustomer(activity.id, customer.id)
  }

  const hasActiveSeq = sequenceStatus?.status === 'active'
  const hasPausedSeq = sequenceStatus?.status === 'paused'
  const seqDone = sequenceStatus?.status === 'completed' || sequenceStatus?.status === 'cancelled'

  return (
    <>
      <div className={`card-hover rounded-[10px] border p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${hasResponded ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : hasActiveSeq || hasPausedSeq ? 'border-blue-400/60 bg-blue-50/30 dark:bg-blue-950/20' : 'bg-card border-border'}`}>
        {hasResponded && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-semibold">
            <span>●</span>
            <span>Customer replied - respond now</span>
          </div>
        )}

        {/* Autoresponder chip — compact single line with inline controls */}
        <div className="flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
          {sequenceStatus ? (
            <>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                hasActiveSeq ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                hasPausedSeq ? 'bg-yellow-500/10 text-yellow-700' :
                'bg-muted text-muted-foreground'
              }`}>
                <Zap className={`h-2.5 w-2.5 ${hasActiveSeq ? 'fill-green-500 text-green-500' : hasPausedSeq ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                {hasActiveSeq
                  ? `Day ${sequenceStatus.step_number ?? 1} · ${sequenceStatus.sequence_name}`
                  : hasPausedSeq ? `Paused · ${sequenceStatus.sequence_name}`
                  : sequenceStatus.status === 'completed' ? 'Sequence done' : 'Sequence stopped'}
              </span>
              {hasActiveSeq && (
                <button
                  className="text-[11px] px-1.5 py-0.5 rounded text-yellow-700 hover:bg-yellow-500/10 transition-colors"
                  onClick={() => handleSequenceAction('pause')}
                  disabled={loading !== null}
                >Pause</button>
              )}
              {hasPausedSeq && (
                <button
                  className="text-[11px] px-1.5 py-0.5 rounded text-green-700 hover:bg-green-500/10 transition-colors"
                  onClick={() => handleSequenceAction('resume')}
                  disabled={loading !== null}
                >Resume</button>
              )}
              {(hasActiveSeq || hasPausedSeq) && (
                <button
                  className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleSequenceAction('cancel')}
                  disabled={loading !== null}
                >Stop</button>
              )}
              {seqDone && <span className="text-[11px] text-muted-foreground">Open to re-enroll</span>}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Zap className="h-2.5 w-2.5 text-muted-foreground/50" />
              No autoresponder
            </span>
          )}
        </div>

        {/* Unsubscribe badges */}
        {(unsubEmail || unsubSms) && (
          <div className="flex gap-2 flex-wrap">
            {unsubEmail && <UnsubscribeBadge variant="email" />}
            {unsubSms && <UnsubscribeBadge variant="sms" />}
          </div>
        )}

        <div
          className="flex items-start gap-2 cursor-pointer hover:opacity-90"
          onClick={handleCardClick}
          onKeyDown={e => e.key === 'Enter' && handleCardClick()}
          role="button"
          tabIndex={0}
          aria-label={`Open ${customer.name}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="default" className="text-xs">New Lead</Badge>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sourceBadgeClass}`}>{sourceLabel}</span>
              <ScoreBadge score={score} />
            </div>
            <p className={`font-[family-name:var(--font-display)] font-bold text-[17px] leading-tight ${stale ? 'text-red-600' : 'text-foreground'}`}>{customer.name}</p>
          </div>
          {(() => { const b = leadAgeBadge(activity.created_at); return (
            <span suppressHydrationWarning className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${b.cls}`}>
              {b.label}
            </span>
          )})()}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
          {lead.phone && (
            <p className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <a href={`tel:${lead.phone}`} className="text-primary underline">{lead.phone}</a>
            </p>
          )}
          {customer.email && (
            <p className="flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              {customer.email}
            </p>
          )}
          {vehicleName ? (
            <p className="flex items-center gap-1.5">
              <Car className="h-3 w-3" />
              <span className="truncate">{vehicleName}{priceStr ? ` · ${priceStr}` : ''}</span>
              <button
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => openCustomer(activity.id, customer.id)}
                title="Edit vehicle"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </p>
          ) : (
            <p className="flex items-center gap-1.5">
              <Car className="h-3 w-3" />
              <button
                className="text-primary hover:underline"
                onClick={() => openCustomer(activity.id, customer.id)}
              >
                + Add vehicle
              </button>
            </p>
          )}
          {lead.zip && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              ZIP {lead.zip}
            </p>
          )}
        </div>

        {lead.comments && (
          <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2 line-clamp-3">
            {lead.comments}
          </p>
        )}



        {stale && (
          <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full w-fit">
            No activity in 15+ days
          </span>
        )}

        {/* Inline appointment picker */}
        {apptOpen && (
          <div className="flex flex-col gap-2 p-2 rounded-lg bg-muted/50 border" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground">Schedule appointment</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={apptDate}
                onChange={e => setApptDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="time"
                value={apptTime}
                onChange={e => setApptTime(e.target.value)}
                className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveAppt}
                disabled={!apptDate || loading !== null}
                className="flex-1 text-xs font-medium py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading === 'appt' ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => setApptOpen(false)}
                className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Primary action row: Call + Text */}
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold transition-colors hover:bg-primary/90"
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          )}
          {customer.primary_phone && (
            <a
              href={`sms:${customer.primary_phone}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold transition-colors hover:bg-secondary/80"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Text
            </a>
          )}
        </div>

        {/* Secondary actions: Schedule, Done, Archive, Follow up, Dismiss */}
        <div className="flex gap-2 items-center flex-wrap" onClick={e => e.stopPropagation()}>
          <button
            className={`text-xs font-medium py-1 px-2 rounded transition-colors flex items-center gap-1 ${apptSaved ? 'bg-blue-500/10 text-blue-700' : 'text-blue-700 bg-blue-500/10 hover:bg-blue-500/20'}`}
            onClick={() => { setApptOpen(o => !o); setApptSaved(false) }}
            disabled={loading !== null}
          >
            {apptSaved ? <><Check className="h-3 w-3" />Scheduled</> : <><CalendarPlus className="h-3 w-3" />Schedule</>}
          </button>
          <button
            className="text-xs font-medium text-green-700 bg-green-500/10 hover:bg-green-500/20 py-1 px-2 rounded transition-colors"
            onClick={async () => {
              onAddressed?.()
              setLoading('done')
              await fetch(`/api/activities/${activity.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addressed_at: new Date().toISOString() }),
              })
              setLoading(null)
              onUpdate()
            }}
            disabled={loading !== null}
          >
            {loading === 'done' ? 'Saving…' : 'Done'}
          </button>

          <div className="relative ml-auto">
            <button
              className="text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-muted flex items-center gap-1 transition-colors"
              onClick={() => setSnoozeExpanded(v => !v)}
              disabled={loading !== null}
            >
              {loading === 'snooze' ? 'Snoozing…' : 'Follow up'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {snoozeExpanded && (
              <div className="absolute right-0 bottom-full mb-1 z-50 bg-popover border rounded-xl shadow-lg py-1 w-40">
                {([
                  ['tomorrow', 'Tomorrow'],
                  ['3days', 'In 3 days'],
                  ['1week', 'In 1 week'],
                  ['2weeks', 'In 2 weeks'],
                ] as const).map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => void handleSnooze(snoozePreset(preset))}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="h-8 text-xs text-muted-foreground hover:text-destructive py-1 px-2 rounded hover:bg-destructive/10 transition-colors"
            onClick={async () => {
              setLoading('archive')
              await fetch(`/api/activities/${activity.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed_at: new Date().toISOString(), outcome: 'no_response' }),
              })
              setLoading(null)
              onUpdate()
            }}
            disabled={loading !== null}
          >
            {loading === 'archive' ? 'Archiving…' : 'Dismiss'}
          </button>
        </div>
      </div>

    </>
  )
}
