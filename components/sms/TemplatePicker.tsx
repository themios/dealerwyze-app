'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Template, Customer, Vehicle } from '@/types'
import { fillTemplate, formatPhoneForTel, prefixWithAuthorName } from '@/lib/utils'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { MessageSquare, Zap, MessageSquareOff, Star, ArrowLeft, Search, PenLine } from 'lucide-react'
import AttachmentPicker, { Attachment } from '@/components/shared/AttachmentPicker'

// ─── Hardcoded fallback templates (used when org has no DB templates yet) ─────
const FALLBACK_TEMPLATES: Template[] = [
  { id: 'f1',  user_id: '', name: 'Thanks for stopping by',   channel: 'sms', category: 'Daily Response', body: 'Hi {firstName}! Thanks for stopping by {dealerName} today. The {vehicle} is still available. Any questions?', created_at: '' },
  { id: 'f2',  user_id: '', name: 'New lead response',         channel: 'sms', category: 'Daily Response', body: "Hi {firstName}, this is Tim at {dealerName}. I saw your inquiry about the {vehicle} — it's available! When works for a test drive?", created_at: '' },
  { id: 'f3',  user_id: '', name: 'Checking in',               channel: 'sms', category: 'Follow-Up',     body: 'Hi {firstName}, just checking in — still interested in the {vehicle}? Happy to answer any questions.', created_at: '' },
  { id: 'f4',  user_id: '', name: 'Follow-up #2',              channel: 'sms', category: 'Follow-Up',     body: "Hey {firstName}! Wanted to follow up on the {vehicle}. It's been getting attention — let me know if you'd like to move forward.", created_at: '' },
  { id: 'f5',  user_id: '', name: 'Last follow-up',            channel: 'sms', category: 'Follow-Up',     body: "Hi {firstName}, I'll stop reaching out after this — just wanted to make sure you hadn't missed out on the {vehicle}. Still available at {price}!", created_at: '' },
  { id: 'f6',  user_id: '', name: 'Schedule test drive',       channel: 'sms', category: 'Test Drive',    body: "Hi {firstName}, when works best for a test drive on the {vehicle}? I'm available weekdays and Saturdays.", created_at: '' },
  { id: 'f7',  user_id: '', name: 'Test drive reminder',       channel: 'sms', category: 'Test Drive',    body: 'Hi {firstName}, reminder: test drive tomorrow at {time} for the {vehicle}. See you then! Call if anything changes: {dealerPhone}', created_at: '' },
  { id: 'f8',  user_id: '', name: 'Appointment confirmed',     channel: 'sms', category: 'Appointment',   body: 'Hi {firstName}, your appointment is confirmed for {date} at {time} to see the {vehicle}. See you then! — {dealerName}', created_at: '' },
  { id: 'f9',  user_id: '', name: 'Financing available',       channel: 'sms', category: 'Financing',     body: 'Hi {firstName}! We have financing options on the {vehicle}. Low down payments available. Want to run some numbers?', created_at: '' },
  { id: 'f10', user_id: '', name: 'Best offer',                channel: 'sms', category: 'Negotiation',   body: 'Hi {firstName}, I want to earn your business. What would it take to make the {vehicle} work for you today?', created_at: '' },
  { id: 'f11', user_id: '', name: 'Price drop alert',          channel: 'sms', category: 'Pricing',       body: 'Good news {firstName}! I dropped the price on the {vehicle} to {price}. Want to take another look?', created_at: '' },
  { id: 'f12', user_id: '', name: 'Trade-in follow-up',        channel: 'sms', category: 'Trade-In',      body: 'Hi {firstName}, following up on your trade-in. I can give you a quick appraisal — bring it by anytime this week!', created_at: '' },
  { id: 'f13', user_id: '', name: 'Thank you',                 channel: 'sms', category: 'Post-Sale',     body: 'Hi {firstName}, great meeting you today! Enjoy the new car. Reach out anytime — Tim at {dealerName} {dealerPhone}', created_at: '' },
  { id: 'f14', user_id: '', name: 'Request review',            channel: 'sms', category: 'Post-Sale',     body: "Hi {firstName}, hope you're loving the car! If you have a moment, a Google review would mean a lot: [link]. Thanks! — {dealerName}", created_at: '' },
]

interface TemplatePickerProps {
  customer: Customer
  vehicle?: Vehicle
  buttonClassName?: string
  labelClassName?: string
}

interface SmsMessage { id: string; body: string; direction: string | null; created_at: string }

type View = 'categories' | 'templates' | 'compose'

export default function TemplatePicker({
  customer,
  vehicle,
  buttonClassName,
  labelClassName = 'lg:hidden',
}: TemplatePickerProps) {
  const [open, setOpen]                       = useState(false)
  const [view, setView]                       = useState<View>('categories')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [body, setBody]                       = useState('')
  const [search, setSearch]                   = useState('')
  const [sending, setSending]                 = useState(false)
  const [sendError, setSendError]             = useState<string | null>(null)
  const [history, setHistory]                 = useState<SmsMessage[]>([])
  const [displayName, setDisplayName]         = useState<string | null>(null)
  const [dbTemplates, setDbTemplates]         = useState<Template[]>([])
  const [attachments, setAttachments]         = useState<Attachment[]>([])
  const [orgPlan, setOrgPlan]                 = useState<string>('free')

  const supabase = createClient()
  const twilioEnabled = process.env.NEXT_PUBLIC_TWILIO_ENABLED === 'true'
  const orgSettings = useOrgSettings()

  useEffect(() => {
    if (!open) return
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setDisplayName(d?.display_name ?? null)
        setOrgPlan(d?.org_plan ?? 'free')
      })
      .catch(() => setDisplayName(null))

    supabase
      .from('templates')
      .select('*')
      .eq('channel', 'sms')
      .order('is_favorite', { ascending: false })
      .order('category')
      .order('created_at')
      .limit(200)
      .then(({ data }) => setDbTemplates(data ?? []))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const templates = dbTemplates.length > 0 ? dbTemplates : FALLBACK_TEMPLATES

  function getVars(): Record<string, string> {
    const firstName = customer.name.split(' ')[0]
    return {
      firstName,
      vehicle:     vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '{vehicle}',
      price:       vehicle?.price ? `$${vehicle.price.toLocaleString()}` : '{price}',
      date: '{date}', time: '{time}', document: '{document}',
      link:        vehicle?.listing_url ?? '[listing link not set]',
      dealerName:  orgSettings.dealerName,
      dealerPhone: orgSettings.dealerPhone,
    }
  }

  // Build category list
  const favorites = templates.filter(t => t.is_favorite)
  const categorySet = new Set<string>()
  for (const t of templates) {
    if (!t.is_favorite) categorySet.add(t.category?.trim() || 'General')
  }
  const categories: string[] = [
    ...(favorites.length > 0 ? ['⭐ Favorites'] : []),
    ...[...categorySet].sort(),
  ]

  function getTemplatesForCategory(cat: string) {
    if (cat === '⭐ Favorites') return favorites
    return templates.filter(t => !t.is_favorite && (t.category?.trim() || 'General') === cat)
  }

  function selectTemplate(t: Template) {
    setSelectedTemplate(t.name)
    setBody(fillTemplate(t.body, getVars()))
    setSendError(null)
    setView('compose')
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('activities')
      .select('id, body, direction, created_at')
      .eq('customer_id', customer.id)
      .eq('type', 'sms')
      .order('created_at', { ascending: false })
      .limit(6)
    setHistory((data ?? []).reverse() as SmsMessage[])
  }

  async function logActivity() {
    const bodyWithAuthor = prefixWithAuthorName(displayName, body)
    await supabase.from('activities').insert({
      type: 'sms', direction: 'outbound',
      customer_id: customer.id,
      vehicle_id: vehicle?.id ?? null,
      body: bodyWithAuthor,
      priority: 'normal',
      completed_at: new Date().toISOString(),
    })
  }

  async function handleOpenMessages() {
    if (customer.sms_opt_out) return
    await logActivity()
    window.location.href = `sms:${formatPhoneForTel(customer.primary_phone)}?body=${encodeURIComponent(body)}`
    resetAndClose()
  }

  async function handleSendTwilio() {
    setSending(true)
    setSendError(null)
    try {
      const mediaUrls = attachments.filter(a => !!a.signedUrl).map(a => a.signedUrl!)
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customer.primary_phone,
          body,
          customer_id: customer.id,
          vehicle_id: vehicle?.id ?? null,
          is_mms: mediaUrls.length > 0,
          mediaUrls,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      resetAndClose()
      loadHistory()
    } catch (err: any) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  function resetAndClose() {
    setOpen(false)
    setView('categories')
    setSelectedCategory(null)
    setSelectedTemplate(null)
    setBody('')
    setSearch('')
    setSendError(null)
    setAttachments([])
  }

  function openSheet() { setOpen(true); setView('categories'); loadHistory() }

  const searchResults = search
    ? templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.body.toLowerCase().includes(search.toLowerCase())
      )
    : []

  if (customer.sms_opt_out) {
    return (
      <Button
        variant="outline"
        size="lg"
        disabled
        className={`border-muted text-muted-foreground opacity-60 cursor-not-allowed lg:px-3 ${buttonClassName ?? ''}`.trim()}
        title="This customer opted out of texts"
      >
        <MessageSquareOff className={`h-4 w-4 ${labelClassName ? 'mr-2' : ''} ${labelClassName === 'lg:hidden' ? 'lg:mr-0' : ''}`.trim()} />
        <span className={labelClassName}>SMS Off</span>
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={`border-[#F07018] text-[#F07018] hover:bg-[#F07018]/10 lg:px-3 ${buttonClassName ?? ''}`.trim()}
        onClick={openSheet}
        title="Text"
      >
        <MessageSquare className={`h-4 w-4 ${labelClassName ? 'mr-2' : ''} ${labelClassName === 'lg:hidden' ? 'lg:mr-0' : ''}`.trim()} />
        <span className={labelClassName}>Text</span>
      </Button>

      <Sheet open={open} onOpenChange={o => { if (!o) resetAndClose() }}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>
              {view === 'categories' && `Text ${customer.name}`}
              {view === 'templates' && (
                <button
                  className="flex items-center gap-1.5 text-base font-semibold"
                  onClick={() => { setView('categories'); setSelectedCategory(null); setSearch('') }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {selectedCategory === '⭐ Favorites' ? 'Favorites' : selectedCategory}
                </button>
              )}
              {view === 'compose' && (
                <button
                  className="flex items-center gap-1.5 text-base font-semibold"
                  onClick={() => {
                    setBody('')
                    setSelectedTemplate(null)
                    setView(selectedCategory ? 'templates' : 'categories')
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {selectedTemplate ?? 'Back'}
                </button>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* SMS history */}
          {history.length > 0 && (
            <div className="flex-shrink-0 mb-3 space-y-1 max-h-36 overflow-y-auto border rounded-lg p-2 bg-muted/30">
              {history.map(msg => (
                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`text-xs px-2.5 py-1.5 rounded-2xl max-w-[80%] ${msg.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}>
                    {msg.body}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Categories ── */}
          {view === 'categories' && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Blank message — always at top */}
              <button
                onClick={() => {
                  setSelectedTemplate('Blank message')
                  setBody('')
                  setSendError(null)
                  setView('compose')
                }}
                className="flex-shrink-0 w-full flex items-center gap-3 p-3 mb-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-accent transition-colors text-left"
              >
                <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">Blank message</p>
                  <p className="text-xs text-muted-foreground">Write from scratch</p>
                </div>
              </button>

              <div className="relative flex-shrink-0 mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search templates…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              {search ? (
                <div className="overflow-y-auto flex-1 space-y-2">
                  {searchResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No matches</p>
                  )}
                  {searchResults.map(t => (
                    <button key={t.id} onClick={() => selectTemplate(t)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors">
                      <div className="flex items-center gap-1 mb-0.5">
                        {t.is_favorite && <Star className="h-3 w-3 text-yellow-500 flex-shrink-0" fill="currentColor" />}
                        <p className="font-medium text-sm">{t.name}</p>
                        <span className="text-[10px] text-muted-foreground ml-auto">{t.category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map(cat => {
                      const count = getTemplatesForCategory(cat).length
                      const isFav = cat === '⭐ Favorites'
                      return (
                        <button
                          key={cat}
                          onClick={() => { setSelectedCategory(cat); setView('templates') }}
                          className={`p-3 rounded-xl border text-left transition-colors hover:bg-accent ${isFav ? 'border-yellow-400/60 bg-yellow-50/50 dark:bg-yellow-950/20' : 'bg-card'}`}
                        >
                          {isFav && <Star className="h-4 w-4 text-yellow-500 mb-1" fill="currentColor" />}
                          <p className="font-medium text-sm leading-snug">{isFav ? 'Favorites' : cat}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{count} template{count !== 1 ? 's' : ''}</p>
                        </button>
                      )
                    })}
                  </div>
                  {categories.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No templates yet. Add them in Settings → Automation.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Templates in category ── */}
          {view === 'templates' && selectedCategory && (
            <div className="overflow-y-auto flex-1 space-y-2">
              {getTemplatesForCategory(selectedCategory).map(t => (
                <button key={t.id} onClick={() => selectTemplate(t)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors">
                  <div className="flex items-center gap-1 mb-0.5">
                    {t.is_favorite && <Star className="h-3 w-3 text-yellow-500 flex-shrink-0" fill="currentColor" />}
                    <p className="font-medium text-sm">{t.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                </button>
              ))}
            </div>
          )}

          {/* ── Compose ── */}
          {view === 'compose' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your message…"
                className="resize-none flex-1"
              />
              <div className="flex-shrink-0">
                <AttachmentPicker
                  vehicleId={vehicle?.id}
                  mode="sms"
                  selected={attachments}
                  onChange={setAttachments}
                />
              </div>
              {sendError && <p className="text-xs text-destructive flex-shrink-0">{sendError}</p>}
              <div className="flex gap-2 flex-shrink-0">
                <Button className="flex-1 h-11 gap-2" onClick={handleOpenMessages}>
                  <MessageSquare className="h-4 w-4" />
                  Open Messages
                </Button>
                {twilioEnabled && (
                  <Button
                    variant="outline"
                    className="flex-1 h-11 gap-2"
                    onClick={orgPlan !== 'free' ? handleSendTwilio : undefined}
                    disabled={sending || orgPlan === 'free'}
                    title={orgPlan === 'free' ? 'Upgrade to a paid plan to send texts directly from DealerWyze' : undefined}
                  >
                    <Zap className="h-4 w-4" />
                    {sending ? 'Sending…' : attachments.length > 0 ? `Send MMS (+${attachments.length})` : 'Send Now'}
                  </Button>
                )}
              </div>
              {twilioEnabled && (
                <p className="text-xs text-center text-muted-foreground flex-shrink-0">
                  {orgPlan === 'free'
                    ? 'Upgrade to send texts directly. Use Open Messages to send from your phone for free.'
                    : attachments.length > 0
                      ? 'Attached files will be sent as a picture message (MMS).'
                      : 'Send Now sends the text immediately to the customer\'s phone.'}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
