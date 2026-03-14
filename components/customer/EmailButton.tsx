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
import { Mail } from 'lucide-react'

interface EmailButtonProps {
  customer: Customer
  vehicle?: Vehicle
  onSent?: () => void
}

export default function EmailButton({ customer, vehicle, onSent }: EmailButtonProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState<string | null>(null)
  const supabase    = createClient()
  const orgSettings = useOrgSettings()

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
      .order('created_at', { ascending: true })
      .then(
        ({ data }) => {
          if (!cancelled) setTemplates((data ?? []) as Template[])
          setLoadingTemplates(false)
        },
        () => setLoadingTemplates(false)
      )
    return () => { cancelled = true }
  }, [open])

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
    setSubject(fillTemplate(t.subject ?? '', vars))
    setBody(fillTemplate(t.body, vars))
  }

  async function handleSend() {
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
      }),
    })
    setSending(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSendError(data.error ?? 'Something went wrong. Please try again.')
      return
    }
    setOpen(false)
    setSelected(null)
    onSent?.()
  }

  return (
    <>
      <Button variant="outline" size="lg" className="border-[#0D2B55] text-[#0D2B55] hover:bg-[#0D2B55]/10" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-2" />
        Email
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Email {customer.name}</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="space-y-2">
              {loadingTemplates ? (
                <p className="text-sm text-muted-foreground">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
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
          ) : (
            <div className="space-y-3">
              <button className="text-sm text-primary" onClick={() => setSelected(null)}>← Back</button>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-11"
              />
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                className="resize-none text-sm"
              />
              {sendError && (
                <p className="text-sm text-destructive">{sendError}</p>
              )}
              <Button className="w-full h-11" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : 'Send Email'}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
