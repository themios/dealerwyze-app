'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CONSENT_DISCLOSURE } from '@/lib/bhph/schedule'
import { localTodayYmd } from '@/lib/bhph/gpsDevice'
import { FileText, ExternalLink, Trash2, X, ArrowRight, CheckCircle, MinusCircle, Star, Heart, Archive } from 'lucide-react'

interface Props {
  vehicleId: string
  vehicleLabel: string
  open: boolean
  onClose: () => void
}

interface DocEntry {
  id: string
  label: string
  file_name: string
  file_size: number | null
  signed_url?: string | null
}

interface CustomerResult { id: string; name: string; primary_phone: string; email?: string }
interface InterestedCustomer { customer_id: string; name: string; primary_phone: string | null; email: string | null; is_buyer?: boolean }
type NotifyStatus = 'idle' | 'sending' | 'sent' | 'skipped'
type ArchiveStatus = 'idle' | 'archiving' | 'archived'
interface DeferredPaymentDraft { due_date: string; amount: string; notes: string }

const INITIAL_FORM = {
  sold_price: '',
  finance_type: 'cash',
  finance_company: '',
  customer_query: '',
  customer_id: '',
  customer_email: '',
  down_payment: '',
  required_down_payment: '',
  loan_amount: '',
  monthly_payment: '',
  payment_frequency: 'monthly',
  payment_day: '1',
  first_due_date: '',
  sms_consent: false,
  email_consent: false,
  notes: '',
  annual_interest_rate_percent: '',
  gps_vendor: '',
  gps_device_id: '',
  gps_installed_at: '',
  gps_notes: '',
}

export default function MarkSoldSheet({ vehicleId, vehicleLabel, open, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Document cleanup step
  const [step, setStep] = useState<'loading' | 'docs' | 'form' | 'postsale' | 'notify'>('loading')
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null)

  const [interestedCustomers, setInterestedCustomers] = useState<InterestedCustomer[]>([])
  const [notifyMessages, setNotifyMessages] = useState<Record<string, string>>({})
  const [notifyStatus, setNotifyStatus] = useState<Record<string, NotifyStatus>>({})
  const [archiveStatus, setArchiveStatus] = useState<Record<string, ArchiveStatus>>({})
  const [emailSubjects, setEmailSubjects] = useState<Record<string, string>>({})
  const [showEmailOptions, setShowEmailOptions] = useState<Record<string, boolean>>({})

  // Post-sale outreach step
  const [postsaleChecks, setPostsaleChecks] = useState({ review: true, pulse: true })
  const [postsaleSending, setPostsaleSending] = useState(false)

  function defaultNotifyMessage(name: string, isBuyer?: boolean) {
    if (isBuyer) {
      return `Hi ${name}, thank you for your purchase! It was a pleasure doing business with you. If you ever need anything, don't hesitate to reach out. Enjoy your new ride!`
    }
    return `Hi ${name}, the ${vehicleLabel} you were interested in just sold. We may have something else that works for you - give us a call or reply here.`
  }

  async function sendNotification(c: InterestedCustomer, channel: 'sms' | 'email') {
    setNotifyStatus(p => ({ ...p, [c.customer_id]: 'sending' }))
    const msg = notifyMessages[c.customer_id] ?? defaultNotifyMessage(c.name, c.is_buyer)
    try {
      let res: Response
      if (channel === 'sms') {
        res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: c.primary_phone, body: msg, customer_id: c.customer_id }),
        })
      } else {
        const subject = emailSubjects[c.customer_id] ?? `About the ${vehicleLabel}`
        res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: c.customer_id, subject, emailBody: msg }),
        })
      }
      if (!res.ok) throw new Error('Send failed')
      setNotifyStatus(p => ({ ...p, [c.customer_id]: 'sent' }))
    } catch {
      setNotifyStatus(p => ({ ...p, [c.customer_id]: 'idle' }))
    }
  }

  async function archiveCustomer(customerId: string) {
    setArchiveStatus(p => ({ ...p, [customerId]: 'archiving' }))
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      })
      if (!res.ok) throw new Error()
      setArchiveStatus(p => ({ ...p, [customerId]: 'archived' }))
    } catch {
      setArchiveStatus(p => ({ ...p, [customerId]: 'idle' }))
    }
  }

  useEffect(() => {
    if (!open) {
      setStep('loading')
      setDocs([])
      setInterestedCustomers([])
      setNotifyMessages({})
      setNotifyStatus({})
      setArchiveStatus({})
      setEmailSubjects({})
      setShowEmailOptions({})
      setPostsaleChecks({ review: true, pulse: true })
      setPostsaleSending(false)
      setForm({ ...INITIAL_FORM })
      setDeferredEnabled(false)
      setDeferredRows([])
      setCustomerResults([])
      setSearching(false)
      setSaving(false)
      setError('')
      return
    }
    fetch(`/api/vehicles/${vehicleId}/documents`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDocs(data)
          setStep('docs')
        } else {
          setStep('form')
        }
      })
      .catch(() => setStep('form')) // if fetch fails, don't block the sale flow
  }, [open, vehicleId])

  async function deleteDoc(docId: string) {
    setDeletingDoc(docId)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== docId))
    setDeletingDoc(null)
    setConfirmDeleteDoc(null)
  }

  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [deferredEnabled, setDeferredEnabled] = useState(false)
  const [deferredRows, setDeferredRows] = useState<DeferredPaymentDraft[]>([])
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: string, value: string | boolean) {
    setForm(p => {
      const next = { ...p, [field]: value }
      if (
        field === 'sold_price' &&
        typeof value === 'string' &&
        p.finance_type === 'bhph' &&
        !String(p.loan_amount).trim()
      ) {
        next.loan_amount = value
      }
      return next
    })
  }

  useEffect(() => {
    if (form.finance_type === 'bhph' && !form.gps_installed_at) {
      setForm(p => ({ ...p, gps_installed_at: localTodayYmd() }))
    }
  }, [form.finance_type, form.gps_installed_at])

  function addDeferredRow() {
    setDeferredRows(prev => [...prev, { due_date: '', amount: '', notes: '' }])
  }

  function updateDeferredRow(index: number, field: keyof DeferredPaymentDraft, value: string) {
    setDeferredRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  function removeDeferredRow(index: number) {
    setDeferredRows(prev => prev.filter((_, i) => i !== index))
  }

  async function searchCustomers(q: string) {
    update('customer_query', q)
    update('customer_id', '')
    update('customer_email', '')
    if (q.length < 2) { setCustomerResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('customers')
      .select('id, name, primary_phone, email')
      .ilike('name', `%${q}%`)
      .limit(6)
    setCustomerResults(data ?? [])
    setSearching(false)
  }

  function selectCustomer(c: CustomerResult) {
    setForm(p => ({
      ...p,
      customer_query: c.name,
      customer_id: c.id,
      customer_email: c.email ?? '',
    }))
    setCustomerResults([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.sold_price) { setError('Sale price is required'); return }
    if (form.finance_type === 'bhph') {
      if (!form.customer_id) { setError('Customer is required for BHPH'); return }
      if (!form.monthly_payment) { setError('Monthly payment is required for BHPH'); return }
      if (!form.first_due_date) { setError('First due date is required for BHPH'); return }
      const requiredDown = parseFloat(form.required_down_payment || '0') || 0
      const actualDown = parseFloat(form.down_payment || '0') || 0
      const remainingDown = Math.max(0, Math.round((requiredDown - actualDown) * 100) / 100)
      const deferredTotal = deferredRows.reduce((sum, row) => sum + (parseFloat(row.amount || '0') || 0), 0)
      if (deferredEnabled && remainingDown <= 0) {
        setError('Deferred down payment requires a remaining balance after collected down payment')
        return
      }
      if (deferredEnabled && deferredRows.length === 0) {
        setError('Add at least one deferred payment date')
        return
      }
      if (deferredEnabled && deferredRows.some(row => !row.due_date || !(parseFloat(row.amount || '0') > 0))) {
        setError('Each deferred payment needs a due date and amount')
        return
      }
      if (deferredEnabled && Math.abs(deferredTotal - remainingDown) > 0.01) {
        setError('Deferred payment amounts must equal the remaining down payment balance')
        return
      }
      if (!form.sms_consent && !form.email_consent) {
        setError('At least one contact consent is required to set up BHPH reminders')
        return
      }
    }
    setSaving(true)
    setError('')

    const res = await fetch('/api/bhph/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        vehicle_id: vehicleId,
        deferred_payments: deferredEnabled ? deferredRows.map(row => ({
          due_date: row.due_date,
          amount: parseFloat(row.amount || '0'),
          notes: row.notes || null,
        })) : [],
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to save sale')
      setSaving(false)
      return
    }

    const interested: InterestedCustomer[] = data.interestedCustomers ?? []
    if (interested.length > 0) {
      const initialMessages: Record<string, string> = {}
      const initialSubjects: Record<string, string> = {}
      for (const c of interested) {
        initialMessages[c.customer_id] = defaultNotifyMessage(c.name, c.is_buyer)
        initialSubjects[c.customer_id] = `About the ${vehicleLabel}`
      }
      setInterestedCustomers(interested)
      setNotifyMessages(initialMessages)
      setEmailSubjects(initialSubjects)
      setNotifyStatus({})
      setArchiveStatus({})
    }
    setStep('postsale')
  }

  async function sendPostsaleMessages() {
    setPostsaleSending(true)
    const customerId = form.customer_id
    if (customerId) {
      const sends: Promise<unknown>[] = []
      if (postsaleChecks.review) {
        sends.push(
          fetch('/api/customers/review-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId }),
          }).catch(() => {})
        )
      }
      if (postsaleChecks.pulse) {
        sends.push(
          fetch('/api/pulse/surveys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId }),
          }).catch(() => {})
        )
      }
      await Promise.all(sends)
    }
    setPostsaleSending(false)
    if (interestedCustomers.length > 0) {
      setStep('notify')
    } else {
      router.refresh()
      onClose()
    }
  }

  const isBhph = form.finance_type === 'bhph'
  const isFinance = form.finance_type === 'finance'
  const requiredDown = parseFloat(form.required_down_payment || '0') || 0
  const actualDown = parseFloat(form.down_payment || '0') || 0
  const remainingDeferred = Math.max(0, Math.round((requiredDown - actualDown) * 100) / 100)
  const deferredDraftTotal = deferredRows.reduce((sum, row) => sum + (parseFloat(row.amount || '0') || 0), 0)

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl h-auto max-h-[92dvh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Mark as Sold — {vehicleLabel}</SheetTitle>
        </SheetHeader>

        {/* Step 1: Document cleanup */}
        {(step === 'loading' || step === 'docs') && (
          <div className="pb-8 space-y-4">
            {step === 'loading' ? (
              <p className="text-sm text-muted-foreground text-center py-6">Checking for attached documents…</p>
            ) : (
              <>
                <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-4 space-y-2">
                  <p className="text-sm font-semibold">
                    {docs.length} document{docs.length !== 1 ? 's' : ''} attached to this vehicle
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Once marked as sold, new uploads are disabled. Open or download any documents
                    you need to keep, then delete them to free up storage space.
                  </p>
                </div>

                <div className="space-y-2">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 p-3 rounded-lg border bg-background">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{doc.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {doc.signed_url && (
                          <a
                            href={doc.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/5 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open
                          </a>
                        )}
                        {confirmDeleteDoc === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteDoc(doc.id)}
                              disabled={deletingDoc === doc.id}
                              className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40 disabled:opacity-50"
                            >
                              {deletingDoc === doc.id ? '…' : 'Delete'}
                            </button>
                            <button onClick={() => setConfirmDeleteDoc(null)} className="text-muted-foreground p-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteDoc(doc.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full h-12 gap-2"
                  onClick={() => setStep('form')}
                >
                  Continue to Sale Details
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {docs.length > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    You can still access and delete these documents from Settings → Vehicle Documents after the sale.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: Sale form */}
        {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4 pb-8">
          {/* Sale price */}
          <div className="space-y-1.5">
            <Label>Sale Price *</Label>
            <Input type="number" placeholder="15500" value={form.sold_price}
              onChange={e => update('sold_price', e.target.value)} className="h-11" required />
          </div>

          {/* Finance type */}
          <div className="space-y-1.5">
            <Label>Finance Type *</Label>
            <Select value={form.finance_type} onValueChange={v => update('finance_type', v)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="finance">Finance Company</SelectItem>
                <SelectItem value="bhph">BHPH (Buy Here Pay Here)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isFinance && (
            <div className="space-y-1.5">
              <Label>Finance Company</Label>
              <Input placeholder="DriveTime, CAR Financial…" value={form.finance_company}
                onChange={e => update('finance_company', e.target.value)} className="h-11" />
            </div>
          )}

          {/* Customer search */}
          <div className="space-y-1.5">
            <Label>Customer {isBhph && '*'}</Label>
            <div className="relative">
              <Input placeholder="Search by name…" value={form.customer_query}
                onChange={e => searchCustomers(e.target.value)} className="h-11" />
              {customerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-popover border rounded-lg shadow-md mt-1 overflow-hidden">
                  {customerResults.map(c => (
                    <button key={c.id} type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                      onClick={() => selectCustomer(c)}>
                      <span className="font-medium">{c.name}</span>
                      {c.primary_phone && <span className="text-muted-foreground ml-2 text-xs">{c.primary_phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {searching && <p className="text-xs text-muted-foreground mt-1">Searching…</p>}
              {form.customer_id && (
                <p className="text-xs text-green-600 mt-1">✓ {form.customer_query} selected</p>
              )}
            </div>
          </div>

          {/* BHPH section */}
          {isBhph && (
            <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BHPH Contract</p>

              {/* Payment frequency */}
              <div className="space-y-1.5">
                <Label>Payment Frequency *</Label>
                <Select value={form.payment_frequency} onValueChange={v => update('payment_frequency', v)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly (every 2 weeks)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Collected Today</Label>
                  <Input type="number" placeholder="2000" value={form.down_payment}
                    onChange={e => update('down_payment', e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>Required Down</Label>
                  <Input type="number" placeholder="3000" value={form.required_down_payment}
                    onChange={e => update('required_down_payment', e.target.value)} className="h-11" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Purchase / contract total</Label>
                  <Input type="number" placeholder="10000" value={form.loan_amount}
                    onChange={e => update('loan_amount', e.target.value)} className="h-11" />
                  <p className="text-xs text-muted-foreground">
                    Amount financed = contract total minus collected down payment.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Deferred Balance</Label>
                  <div className="h-11 rounded-md border bg-background px-3 flex items-center text-sm">
                    {remainingDeferred.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Annual interest rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="0 for no interest"
                  value={form.annual_interest_rate_percent}
                  onChange={e => update('annual_interest_rate_percent', e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment Amount *</Label>
                  <Input type="number" placeholder="350" value={form.monthly_payment}
                    onChange={e => update('monthly_payment', e.target.value)} className="h-11" />
                </div>
                {form.payment_frequency === 'monthly' && (
                  <div className="space-y-1.5">
                    <Label>Day of Month</Label>
                    <Input type="number" min={1} max={31} placeholder="1" value={form.payment_day}
                      onChange={e => update('payment_day', e.target.value)} className="h-11" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>First Payment Due *</Label>
                <Input type="date" value={form.first_due_date}
                  onChange={e => update('first_due_date', e.target.value)} className="h-11" />
              </div>

              <div className="space-y-3 border-t pt-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deferredEnabled}
                    onChange={e => {
                      setDeferredEnabled(e.target.checked)
                      if (e.target.checked && deferredRows.length === 0) addDeferredRow()
                    }}
                    className="mt-1 h-4 w-4 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium">Set up deferred down payment plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use this when the buyer owes part of the required down payment after delivery.
                    </p>
                  </div>
                </label>

                {deferredEnabled && (
                  <div className="space-y-3 rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deferred installments</p>
                        <p className="text-[11px] text-muted-foreground">
                          Remaining target: {remainingDeferred.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          {' · '}
                          Planned: {deferredDraftTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={addDeferredRow}>Add date</Button>
                    </div>

                    {deferredRows.map((row, index) => (
                      <div key={`${index}-${row.due_date}-${row.amount}`} className="space-y-2 rounded-lg border p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Due Date</Label>
                            <Input
                              type="date"
                              value={row.due_date}
                              onChange={e => updateDeferredRow(index, 'due_date', e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Amount</Label>
                            <Input
                              type="number"
                              value={row.amount}
                              onChange={e => updateDeferredRow(index, 'amount', e.target.value)}
                              className="h-10"
                              placeholder="500"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Notes</Label>
                          <Input
                            value={row.notes}
                            onChange={e => updateDeferredRow(index, 'notes', e.target.value)}
                            className="h-10"
                            placeholder="Promise to pay after payday"
                          />
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="text-destructive px-0" onClick={() => removeDeferredRow(index)}>
                          Remove installment
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GPS device (optional) */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GPS device (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label>Vendor</Label>
                    <Input
                      placeholder="PassTime, GPS Trackit…"
                      value={form.gps_vendor}
                      onChange={e => update('gps_vendor', e.target.value)}
                      className="h-11"
                      list="mark-sold-gps-vendors"
                    />
                    <datalist id="mark-sold-gps-vendors">
                      <option value="PassTime" />
                      <option value="GPS Trackit" />
                      <option value="Spireon" />
                      <option value="CalAmp" />
                      <option value="Ituran" />
                    </datalist>
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label>GPS / device ID</Label>
                    <Input
                      placeholder="Serial or account #"
                      value={form.gps_device_id}
                      onChange={e => update('gps_device_id', e.target.value)}
                      className="h-11 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date installed</Label>
                    <Input
                      type="date"
                      value={form.gps_installed_at}
                      onChange={e => update('gps_installed_at', e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Device notes</Label>
                  <Textarea
                    placeholder="Install location, tech name, etc."
                    value={form.gps_notes}
                    onChange={e => update('gps_notes', e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>

              {/* Reminders section */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Reminders</p>

                {/* SMS consent */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.sms_consent}
                    onChange={e => update('sms_consent', e.target.checked)}
                    className="mt-1 h-4 w-4 rounded" />
                  <div>
                    <p className="text-sm font-medium">SMS Reminders</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Customer confirms: {CONSENT_DISCLOSURE}
                    </p>
                  </div>
                </label>

                {/* Email + consent */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.email_consent}
                      onChange={e => update('email_consent', e.target.checked)}
                      className="h-4 w-4 rounded" />
                    <span className="text-sm font-medium">Email Reminders</span>
                  </label>
                  {form.email_consent && (
                    <Input type="email" placeholder="customer@email.com" value={form.customer_email}
                      onChange={e => update('customer_email', e.target.value)} className="h-11" />
                  )}
                </div>

                {(form.sms_consent || form.email_consent) && (
                  <p className="text-xs text-muted-foreground bg-blue-500/10 text-blue-700 rounded-lg p-2">
                    Reminders will be sent: 3 days before, on due date, 2 days late, 7 days late.
                    Sending hours: 9am–7pm dealership time.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Any deal notes…" value={form.notes}
              onChange={e => update('notes', e.target.value)} rows={2} className="resize-none" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
            {saving ? 'Saving…' : 'Mark as Sold'}
          </Button>
        </form>
        )}

        {/* Step 3: Post-sale outreach */}
        {step === 'postsale' && (
          <div className="pb-8 space-y-4">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 p-3">
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">Sale saved!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {form.customer_id
                  ? 'Send post-sale messages to the buyer.'
                  : 'No customer linked - outreach messages require a customer.'}
              </p>
            </div>

            {form.customer_id && (
              <div className="bg-card rounded-xl border p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Post-Sale Messages</p>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={postsaleChecks.review}
                    onChange={e => setPostsaleChecks(p => ({ ...p, review: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded"
                  />
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Google Review Request</p>
                      <p className="text-xs text-muted-foreground">Ask the buyer to leave a Google review</p>
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={postsaleChecks.pulse}
                    onChange={e => setPostsaleChecks(p => ({ ...p, pulse: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded"
                  />
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Customer Pulse Survey</p>
                      <p className="text-xs text-muted-foreground">Anonymous satisfaction survey to track your score</p>
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div className="flex gap-2">
              {form.customer_id && (postsaleChecks.review || postsaleChecks.pulse) ? (
                <Button
                  className="flex-1 h-12"
                  disabled={postsaleSending}
                  onClick={sendPostsaleMessages}
                >
                  {postsaleSending ? 'Sending...' : 'Send Selected'}
                </Button>
              ) : (
                <Button
                  className="flex-1 h-12"
                  onClick={() => {
                    if (interestedCustomers.length > 0) setStep('notify')
                    else { router.refresh(); onClose() }
                  }}
                >
                  {interestedCustomers.length > 0 ? 'Next' : 'Done'}
                </Button>
              )}
              {form.customer_id && (postsaleChecks.review || postsaleChecks.pulse) && (
                <Button
                  variant="ghost"
                  className="h-12 px-4"
                  disabled={postsaleSending}
                  onClick={() => {
                    if (interestedCustomers.length > 0) setStep('notify')
                    else { router.refresh(); onClose() }
                  }}
                >
                  Skip
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Notify interested customers */}
        {step === 'notify' && (
          <div className="pb-8 space-y-4">
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3">
              <p className="text-sm font-semibold">Sale complete - send your messages</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Thank the buyer, then let interested customers know it sold. Edit before sending.
              </p>
            </div>

            <div className="space-y-4">
              {interestedCustomers.map(c => {
                const status = notifyStatus[c.customer_id] ?? 'idle'
                const archived = archiveStatus[c.customer_id] ?? 'idle'
                const msg = notifyMessages[c.customer_id] ?? defaultNotifyMessage(c.name, c.is_buyer)
                const emailSubject = emailSubjects[c.customer_id] ?? `About the ${vehicleLabel}`
                const emailExpanded = showEmailOptions[c.customer_id] ?? false

                if (archived === 'archived') {
                  return (
                    <div key={c.customer_id} className="rounded-lg border bg-muted/20 border-dashed p-3 flex items-center gap-2 opacity-60">
                      <Archive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium line-through text-muted-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">Archived — removed from active leads</p>
                      </div>
                    </div>
                  )
                }

                if (status === 'sent') {
                  return (
                    <div key={c.customer_id} className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">Message sent</p>
                      </div>
                    </div>
                  )
                }

                if (status === 'skipped') {
                  return (
                    <div key={c.customer_id} className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MinusCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">Skipped</p>
                        </div>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive shrink-0 text-xs h-7 px-2"
                        disabled={archived === 'archiving'}
                        onClick={() => archiveCustomer(c.customer_id)}
                      >
                        {archived === 'archiving' ? '…' : 'Archive'}
                      </Button>
                    </div>
                  )
                }

                return (
                  <div key={c.customer_id} className={`rounded-lg border p-3 space-y-2 ${c.is_buyer ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {c.name}
                          {c.is_buyer && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-green-600 bg-green-100 dark:bg-green-900/40 rounded px-1.5 py-0.5">Buyer</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.primary_phone ?? c.email ?? 'No contact info'}</p>
                      </div>
                    </div>

                    {/* Message body — always editable */}
                    <Textarea
                      value={msg}
                      onChange={e => setNotifyMessages(p => ({ ...p, [c.customer_id]: e.target.value }))}
                      rows={3}
                      className="resize-none text-sm"
                      disabled={status === 'sending'}
                    />

                    {/* Email options — subject line, expandable */}
                    {c.email && (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                          onClick={() => setShowEmailOptions(p => ({ ...p, [c.customer_id]: !emailExpanded }))}
                        >
                          {emailExpanded ? 'Hide email options ▲' : 'Email options ▼'}
                        </button>
                        {emailExpanded && (
                          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                            <Label className="text-xs">Subject</Label>
                            <Input
                              value={emailSubject}
                              onChange={e => setEmailSubjects(p => ({ ...p, [c.customer_id]: e.target.value }))}
                              className="h-8 text-sm"
                              disabled={status === 'sending'}
                              placeholder="Email subject…"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Tip: mention a similar vehicle in the message body to offer an alternative.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {c.primary_phone && (
                        <Button size="sm" className="flex-1" disabled={status === 'sending'}
                          onClick={() => sendNotification(c, 'sms')}>
                          {status === 'sending' ? 'Sending…' : 'Text'}
                        </Button>
                      )}
                      {c.email && (
                        <Button size="sm" variant="outline" className="flex-1" disabled={status === 'sending'}
                          onClick={() => sendNotification(c, 'email')}>
                          {status === 'sending' ? 'Sending…' : 'Email'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        onClick={() => setNotifyStatus(p => ({ ...p, [c.customer_id]: 'skipped' }))}>
                        Skip
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={archived === 'archiving'}
                        onClick={() => archiveCustomer(c.customer_id)}
                      >
                        {archived === 'archiving' ? '…' : <><Archive className="h-3.5 w-3.5 mr-1" />Archive</>}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button className="w-full h-12" onClick={() => { router.refresh(); onClose() }}>
              Done
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
