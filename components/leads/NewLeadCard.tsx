'use client'

import { useState, useEffect } from 'react'
import { Activity, Template } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { fillTemplate, tomorrow9am, leadAgeBadge } from '@/lib/utils'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, MapPin, Car } from 'lucide-react'
import Link from 'next/link'
import CallButton from '@/components/call/CallButton'
import TemplatePicker from '@/components/sms/TemplatePicker'

const FOLLOWUP_TEMPLATES: Record<number, { subject: string; body: string }> = {
  2: {
    subject: 'Following up — {vehicle}',
    body: 'Hi {firstName},\n\nJust following up on the {vehicle}{price}. Still interested?\n\nHere\'s the listing: {link}\n\nHappy to answer any questions or set up a test drive.\n\nTim\n{dealerName} | {dealerPhone}',
  },
  3: {
    subject: '{vehicle} — Still Available',
    body: 'Hi {firstName},\n\nThe {vehicle} is still available{price}. We also offer competitive financing with low down payments.\n\nWould love to help you find the right terms.\n\nTim\n{dealerName} | {dealerPhone}',
  },
  4: {
    subject: '{vehicle} — Getting Attention',
    body: 'Hi {firstName},\n\nJust a heads up — the {vehicle} has been getting attention from other buyers. I\'d hate for you to miss out.\n\nWant to lock in a test drive this week?\n\nTim\n{dealerName} | {dealerPhone}',
  },
  5: {
    subject: 'Last Note — {vehicle}',
    body: 'Hi {firstName},\n\nThis will be my last follow-up. The {vehicle} at {price} is still available if you\'re interested.\n\nIf now\'s not the right time, no worries — feel free to reach out whenever you\'re ready.\n\nTim\n{dealerName} | {dealerPhone}',
  },
}

const SOURCE_LABELS: Record<string, string> = {
  cargurus: 'CarGurus',
  autotrader: 'AutoTrader',
  offerup: 'OfferUp',
  cargurus_digest: 'CarGurus Digest',
  facebook: 'Facebook',
}

interface NewLeadCardProps {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string; email?: string; sms_opt_out?: boolean }
  }
  templates: Template[]
  onUpdate: () => void
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

/** Rule-based lead score 0–10 */
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
  const color = score >= 7 ? 'bg-red-500/10 text-red-600' : score >= 4 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-muted text-muted-foreground'
  const label = score >= 7 ? 'Hot' : score >= 4 ? 'Warm' : 'Cold'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label} {score}/10
    </span>
  )
}

export default function NewLeadCard({ activity, templates, onUpdate }: NewLeadCardProps) {
  const lead = parseLead(activity.body || '')

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [listingUrl, setListingUrl] = useState('')
  const supabase = createClient()
  const orgSettings = useOrgSettings()

  useEffect(() => {
    if (!lead.vin) return
    supabase
      .from('vehicles')
      .select('listing_url')
      .eq('vin', lead.vin)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.listing_url) setListingUrl(data.listing_url)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.vin])
  const customer = activity.customer
  const firstName = customer.name.split(' ')[0]
  const vehicleParts = lead.vehicleLine.split(' — ')
  const vehicleName = vehicleParts[0]
  const priceStr = vehicleParts[1] || ''
  const score = scoreLeadActivity(activity as any, lead)

  // Detect source from activity body or customer lead_source
  const sourceLabel = SOURCE_LABELS[(activity as any).customer?.lead_source ?? ''] ?? 'Lead'

  function getVars() {
    return {
      firstName,
      vehicle:     vehicleName || '{vehicle}',
      price:       priceStr ? ` at ${priceStr}` : '',
      vinLine:     lead.vin ? `• VIN: ${lead.vin}` : '',
      link:        listingUrl,
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

    await supabase.from('activities').insert({
      user_id: activity.user_id,
      customer_id: customer.id,
      type: 'email',
      direction: 'outbound',
      outcome: 'pending',
      priority: 'normal',
      body: `Subject: ${subject}\n\n${emailBody}`,
      completed_at: new Date().toISOString(),
      sequence_day: 1,
    })

    const vars = getVars()
    const day2 = FOLLOWUP_TEMPLATES[2]
    await supabase.from('activities').insert({
      user_id: activity.user_id,
      customer_id: customer.id,
      type: 'email',
      direction: 'outbound',
      outcome: 'pending',
      priority: 'normal',
      body: JSON.stringify({
        to: customer.email,
        subject: fillTemplate(day2.subject, vars),
        body: fillTemplate(day2.body, vars),
        sequence_day: 2,
        customer_name: customer.name,
        vehicle: vehicleName,
      }),
      due_at: tomorrow9am().toISOString(),
      sequence_day: 2,
    })

    window.open(
      `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`,
      '_blank'
    )

    setLoading(null)
    setOpen(false)
    onUpdate()
  }

  async function handleDismiss() {
    setLoading('dismiss')
    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed_at: new Date().toISOString(), outcome: 'answered' }),
    })
    setLoading(null)
    onUpdate()
  }

  return (
    <>
      <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="default" className="text-xs">New Lead</Badge>
              <span className="text-xs text-muted-foreground">{sourceLabel}</span>
              <ScoreBadge score={score} />
            </div>
            <Link href={`/customers/${customer.id}`} className="font-semibold text-sm hover:underline">{customer.name}</Link>
            {vehicleName && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <Car className="h-3 w-3" />
                {vehicleName}{priceStr ? ` · ${priceStr}` : ''}
              </p>
            )}
          </div>
          {/* Lead age badge top-right */}
          {(() => { const b = leadAgeBadge(activity.created_at); return (
            <span suppressHydrationWarning className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${b.cls}`}>
              {b.label}
            </span>
          )})()}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
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

        <div className="flex gap-2">
          <CallButton
            customerId={customer.id}
            customerName={customer.name}
            phone={lead.phone || customer.primary_phone}
            className="flex-1"
          />
          <TemplatePicker customer={customer as any} />
          <Button
            size="lg"
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(true)}
            disabled={!customer.email}
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>Reply to {firstName}</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="flex-1 overflow-y-auto space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No templates yet. Add them in Settings → Lead Response Templates.
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
                ← Choose different template
              </button>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="h-11 flex-shrink-0" />
              <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} className="resize-none flex-1 text-sm" />
              <Button className="flex-1 h-11 flex-shrink-0" onClick={handleSend} disabled={loading !== null}>
                {loading === 'send' ? '…' : 'Send & Schedule Follow-up'}
              </Button>
              <p className="text-xs text-center text-muted-foreground flex-shrink-0">
                Opens Gmail · Follow-up #2 queued for tomorrow
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
