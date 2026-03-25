'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, Vehicle, Template } from '@/types'
import { fillTemplate } from '@/lib/utils'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Mail, PenLine } from 'lucide-react'
import AttachmentPicker, { Attachment } from '@/components/shared/AttachmentPicker'

export interface ReplyContext {
  subject: string
  threadId: string | null
  messageId: string | null
}

interface EmailButtonProps {
  customer: Customer
  vehicle?: Vehicle
  onSent?: () => void
  /** When set, sheet auto-opens in reply compose mode */
  replyContext?: ReplyContext | null
  onReplyComplete?: () => void
}

export default function EmailButton({ customer, vehicle, onSent, replyContext, onReplyComplete }: EmailButtonProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [isBlank, setIsBlank] = useState(false)
  const [isReply, setIsReply] = useState(false)
  const [activeReplyCtx, setActiveReplyCtx] = useState<ReplyContext | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const supabase    = createClient()
  const orgSettings = useOrgSettings()

  // Auto-open in reply mode when replyContext is set by parent
  useEffect(() => {
    if (!replyContext) return
    const reSubject = replyContext.subject.startsWith('Re:')
      ? replyContext.subject
      : `Re: ${replyContext.subject}`
    setActiveReplyCtx(replyContext)
    setIsReply(true)
    setIsBlank(false)
    setSelected(null)
    setSubject(reSubject)
    setBody('')
    setAttachments([])
    setSendError(null)
    setOpen(true)
  }, [replyContext]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    setDisplayName(null)
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setDisplayName(d?.display_name ?? null))
      .catch(() => setDisplayName(null))
    setLoadingTemplates(true)
    let cancelled = false
    supabase
      .from('templates')
      .select('*')
      .eq('channel', 'email')
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: true })
      .then(
        ({ data }) => {
          if (!cancelled) setTemplates((data ?? []) as Template[])
          setLoadingTemplates(false)
        },
        () => setLoadingTemplates(false)
      )
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function getVars(): Record<string, string> {
    const firstName = customer.name.split(' ')[0]
    const baseUrl = (orgSettings.dealerWebsiteUrl ?? '').replace(/\/$/, '')
    const inventoryPath = orgSettings.dealerWebsiteInventoryPath ?? '/cars-for-sale'
    let link = ''
    if (vehicle?.listing_url) {
      link = vehicle.listing_url.startsWith('http')
        ? vehicle.listing_url
        : baseUrl
          ? `${baseUrl}${vehicle.listing_url.startsWith('/') ? '' : '/'}${vehicle.listing_url}`
          : vehicle.listing_url
    }
    if (!link && baseUrl) link = `${baseUrl}${inventoryPath.startsWith('/') ? '' : '/'}${inventoryPath}`
    if (!link) link = 'https://www.apolloauto-em.com/cars-for-sale'
    return {
      firstName,
      vehicle:     vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '{vehicle}',
      price:       vehicle?.price ? `$${vehicle.price.toLocaleString()}` : '{price}',
      link,
      date: '{date}', time: '{time}',
      dealerName:  orgSettings.dealerName,
      dealerPhone: orgSettings.dealerPhone,
    }
  }

  function selectTemplate(t: Template) {
    const vars = getVars()
    setSelected(t)
    setIsBlank(false)
    setSubject(fillTemplate(t.subject ?? '', vars))
    setBody(fillTemplate(t.body, vars))
  }

  function openBlank() {
    setSelected(null)
    setIsBlank(true)
    setSubject('')
    setBody('')
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setSendError('Subject and message are required.')
      return
    }
    setSending(true)
    setSendError(null)
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customer.id,
        subject,
        emailBody: body,
        vehicle_id: vehicle?.id ?? null,
        attachments: attachments.length > 0 ? attachments : undefined,
        reply_thread_id: activeReplyCtx?.threadId ?? null,
        in_reply_to_id:  activeReplyCtx?.messageId ?? null,
      }),
    })
    setSending(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSendError(data.error ?? 'Something went wrong. Please try again.')
      return
    }
    setOpen(false)
    resetCompose()
    onSent?.()
    onReplyComplete?.()
  }

  function resetCompose() {
    setSelected(null)
    setIsBlank(false)
    setIsReply(false)
    setActiveReplyCtx(null)
    setSubject('')
    setBody('')
    setAttachments([])
    setSendError(null)
  }

  const inCompose = !!(selected || isBlank || isReply)

  return (
    <>
      <Button variant="outline" size="lg" className="border-[#0D2B55] text-[#0D2B55] hover:bg-[#0D2B55]/10" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-2" />
        Email
      </Button>

      <Sheet open={open} onOpenChange={o => { if (!o) { setOpen(false); resetCompose(); onReplyComplete?.() } }}>
        <SheetContent side="bottom" className="h-[90vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-4 flex-shrink-0">
            <SheetTitle>
              {!inCompose ? (
                `Email ${customer.name}`
              ) : (
                <button className="flex items-center gap-1.5 text-base font-semibold" onClick={resetCompose}>
                  ← {isReply ? `Reply to ${customer.name}` : selected?.name ?? 'Blank email'}
                </button>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Template picker */}
          {!inCompose && (
            <div className="flex-1 overflow-y-auto space-y-2">
              {/* Blank email option — always first */}
              <button
                onClick={openBlank}
                className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-accent transition-colors text-left"
              >
                <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">Blank email</p>
                  <p className="text-xs text-muted-foreground">Write from scratch</p>
                </div>
              </button>

              <div className="border-t my-1" />

              {loadingTemplates ? (
                <p className="text-sm text-muted-foreground px-1">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">
                  No email templates yet. Add them in Settings → Lead Response Templates.
                </p>
              ) : (
                templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject ?? '(no subject)'}</p>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Compose view */}
          {inCompose && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-11 flex-shrink-0"
              />
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your message…"
                className="resize-none flex-1 text-sm"
              />
              <div className="flex-shrink-0">
                <AttachmentPicker
                  vehicleId={vehicle?.id}
                  mode="email"
                  selected={attachments}
                  onChange={setAttachments}
                />
              </div>
              {sendError && (
                <p className="text-sm text-destructive flex-shrink-0">{sendError}</p>
              )}
              <Button
                className="w-full h-11 flex-shrink-0"
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
              >
                {sending ? 'Sending…' : `Send Email${attachments.length > 0 ? ` (+${attachments.length} file${attachments.length > 1 ? 's' : ''})` : ''}`}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
