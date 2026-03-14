'use client'

import { useState, useEffect } from 'react'
import { Activity, Template } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { fillTemplate, tomorrow8am, leadAgeBadge, leadIsStale } from '@/lib/utils'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, MapPin, Car, Paperclip, Pause, X, RotateCcw } from 'lucide-react'
import CallButton from '@/components/call/CallButton'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'
import TemplatePicker from '@/components/sms/TemplatePicker'
import CustomerQuickUploadSheet from '@/components/customer/CustomerQuickUploadSheet'
import EnrollSheet from '@/components/sequences/EnrollSheet'
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
  templates: Template[]
  onUpdate: () => void
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
      {label} {score}/10
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NewLeadCard({ activity, templates, onUpdate, hasResponded, sequenceStatus }: NewLeadCardProps) {
  const lead = parseLead(activity.body || '')

  const [open, setOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [listingUrl, setListingUrl] = useState('')
  const supabase = createClient()
  const orgSettings = useOrgSettings()
  const openCustomer = useOpenCustomer()

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (lead.vin) {
        const { data } = await supabase
          .from('vehicles')
          .select('listing_url')
          .eq('vin', lead.vin)
          .maybeSingle()
        if (!cancelled && data?.listing_url) {
          setListingUrl(data.listing_url)
          return
        }
      }
      const parsed = parseYearMakeModel(lead.vehicleLine || '')
      if (!parsed) return
      const { data } = await supabase
        .from('vehicles')
        .select('listing_url')
        .eq('year', parsed.year)
        .eq('make', parsed.make)
        .eq('model', parsed.model)
        .not('listing_url', 'is', null)
        .limit(1)
        .maybeSingle()
      if (!cancelled && data?.listing_url) setListingUrl(data.listing_url)
    }
    resolve()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.vin, lead.vehicleLine])

  const customer = activity.customer
  const stale = leadIsStale(activity.created_at)
  const firstName = customer.name.split(' ')[0]
  const vehicleParts = lead.vehicleLine.split(' — ')
  const vehicleName = vehicleParts[0]
  const priceStr = vehicleParts[1] || ''
  const score = scoreLeadActivity(activity as any, lead)

  const sourceLabel = SOURCE_LABELS[(activity as any).customer?.lead_source ?? ''] ?? 'Lead'

  const unsubEmail = customer.unsubscribe_email ?? false
  const unsubSms = customer.unsubscribe_sms ?? false

  function getVars() {
    const baseUrl = (orgSettings.dealerWebsiteUrl ?? '').replace(/\/$/, '')
    const inventoryPath = orgSettings.dealerWebsiteInventoryPath ?? '/cars-for-sale'
    const link = listingUrl
      ? listingUrl
      : baseUrl
        ? `${baseUrl}${inventoryPath.startsWith('/') ? '' : '/'}${inventoryPath}`
        : 'https://www.apolloauto-em.com/cars-for-sale'
    return {
      firstName,
      vehicle:     vehicleName || '{vehicle}',
      price:       priceStr ? ` at ${priceStr}` : '',
      vinLine:     lead.vin ? `• VIN: ${lead.vin}` : '',
      link,
      dealerName:  orgSettings.dealerName,
      dealerPhone: orgSettings.dealerPhone,
    }
  }

  function selectTemplate(t: Template) {
    const vars = getVars()
    setSelected(t)
    setSubject(fillTemplate(t.subject || '', vars))
    setEmailBody(fillTemplate(t.body, vars))
  }

  async function handleSend() {
    if (!customer.email) return
    setLoading('send')

    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed_at: new Date().toISOString(), outcome: 'answered' }),
    })

    const sendRes = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customer.id, subject, emailBody }),
    })
    if (!sendRes.ok) {
      const errData = await sendRes.json().catch(() => ({}))
      alert(errData.error ?? 'Could not send email. Check Settings - Integrations.')
      setLoading(null)
      return
    }

    fetch('/api/activities/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customer.id }),
    }).catch(() => {})

    setLoading(null)
    setOpen(false)
    // Open enroll sheet after send if no active sequence
    if (!sequenceStatus || sequenceStatus.status === 'completed' || sequenceStatus.status === 'cancelled') {
      setEnrollOpen(true)
    } else {
      onUpdate()
    }
  }

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

  async function handleDismiss() {
    setLoading('dismiss')
    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozed_until: tomorrow8am().toISOString() }),
    })
    setLoading(null)
    onUpdate()
  }

  const handleCardClick = () => openCustomer(activity.id, customer.id)

  const hasActiveSeq = sequenceStatus?.status === 'active'
  const hasPausedSeq = sequenceStatus?.status === 'paused'
  const seqDone = sequenceStatus?.status === 'completed' || sequenceStatus?.status === 'cancelled'

  return (
    <>
      <div className={`rounded-lg border-2 p-4 space-y-3 ${hasResponded ? 'border-green-500 bg-green-50/50' : hasActiveSeq || hasPausedSeq ? 'border-blue-400/60 bg-blue-50/30' : 'border-primary/20 bg-primary/5'}`}>
        {hasResponded && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-semibold">
            <span>●</span>
            <span>Customer replied - respond now</span>
          </div>
        )}

        {/* Sequence status banner */}
        {hasActiveSeq && sequenceStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {sequenceStatus.sequence_name}
              {sequenceStatus.step_number && sequenceStatus.step_total
                ? ` - Step ${sequenceStatus.step_number} of ${sequenceStatus.step_total}`
                : ''}
            </span>
            {sequenceStatus.next_step_due && (
              <span className="text-xs text-muted-foreground">Next: {formatDate(sequenceStatus.next_step_due)}</span>
            )}
          </div>
        )}
        {hasPausedSeq && sequenceStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 text-xs font-medium">
              Paused - {sequenceStatus.sequence_name}
            </span>
          </div>
        )}
        {seqDone && sequenceStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              {sequenceStatus.status === 'completed' ? 'Completed' : 'Cancelled'} - {sequenceStatus.sequence_name}
            </span>
          </div>
        )}

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
              <span className="text-xs text-muted-foreground">{sourceLabel}</span>
              <ScoreBadge score={score} />
            </div>
            <p className={`font-semibold text-sm ${stale ? 'text-red-600' : ''}`}>{customer.name}</p>
            {vehicleName && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <Car className="h-3 w-3" />
                {vehicleName}{priceStr ? ` · ${priceStr}` : ''}
              </p>
            )}
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

        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <CallButton
            customerId={customer.id}
            customerName={customer.name}
            phone={lead.phone || customer.primary_phone}
            className="flex-1 lg:flex-none lg:px-3"
            labelClassName="lg:hidden"
          />
          <TemplatePicker customer={customer as any} />
          <Button
            size="lg"
            variant="outline"
            className="flex-1 lg:flex-none lg:px-3"
            onClick={() => {
              if (!customer.email) return
              if (!sequenceStatus || seqDone) {
                setEnrollOpen(true)
              } else {
                setOpen(true)
              }
            }}
            disabled={!customer.email || unsubEmail}
            title={unsubEmail ? 'Email opted out' : 'Email'}
          >
            <Mail className="h-4 w-4 lg:mr-0 mr-2" />
            <span className="lg:hidden">Email</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="px-3"
            onClick={() => setUploadOpen(true)}
            title="Attach document"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>

        {/* Sequence action buttons */}
        {hasActiveSeq && (
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => handleSequenceAction('pause')}
              disabled={loading !== null}
            >
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs text-destructive border-destructive/30"
              onClick={() => handleSequenceAction('cancel')}
              disabled={loading !== null}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}
        {hasPausedSeq && (
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => handleSequenceAction('resume')}
              disabled={loading !== null}
            >
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs text-destructive border-destructive/30"
              onClick={() => handleSequenceAction('cancel')}
              disabled={loading !== null}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}
        {seqDone && (
          <div onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setEnrollOpen(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Re-enroll
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          {stale ? (
            <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              No activity in 15+ days
            </span>
          ) : <span />}
          <div className="flex gap-3">
            {stale && (
              <button
                className="text-xs text-red-500 hover:text-red-700 py-1"
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
                {loading === 'archive' ? 'Archiving...' : 'Archive'}
              </button>
            )}
            <button
              className="text-xs text-muted-foreground hover:text-foreground py-1"
              onClick={handleDismiss}
              disabled={loading !== null}
            >
              {loading === 'dismiss' ? 'Snoozing...' : 'Snooze to tomorrow'}
            </button>
          </div>
        </div>
      </div>

      <CustomerQuickUploadSheet
        customerId={customer.id}
        customerName={customer.name}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />

      <EnrollSheet
        customerId={customer.id}
        customerName={customer.name}
        channel="email"
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={() => { setEnrollOpen(false); onUpdate() }}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>Reply to {firstName}</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="flex-1 overflow-y-auto space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No templates yet. Add them in Settings - Lead Response Templates.
                </p>
              )}
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <button className="text-sm text-primary text-left flex-shrink-0" onClick={() => setSelected(null)}>
                Back to templates
              </button>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="h-11 flex-shrink-0" />
              <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} className="resize-none flex-1 text-sm" />
              <Button className="flex-1 h-11 flex-shrink-0" onClick={handleSend} disabled={loading !== null}>
                {loading === 'send' ? '...' : 'Send & Start Sequence'}
              </Button>
              <p className="text-xs text-center text-muted-foreground flex-shrink-0">
                Sends now - choose a follow-up sequence after sending
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
