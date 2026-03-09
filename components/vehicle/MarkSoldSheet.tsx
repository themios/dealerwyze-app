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
import { FileText, ExternalLink, Trash2, X, ArrowRight } from 'lucide-react'

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

export default function MarkSoldSheet({ vehicleId, vehicleLabel, open, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Document cleanup step
  const [step, setStep] = useState<'loading' | 'docs' | 'form'>('loading')
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setStep('loading'); setDocs([]); return }
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

  const [form, setForm] = useState({
    sold_price: '',
    finance_type: 'cash',
    finance_company: '',
    customer_query: '',
    customer_id: '',
    customer_email: '',
    // BHPH
    down_payment: '',
    loan_amount: '',
    monthly_payment: '',
    payment_frequency: 'monthly',
    payment_day: '1',
    first_due_date: '',
    sms_consent: false,
    email_consent: false,
    notes: '',
  })
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: string, value: string | boolean) {
    setForm(p => ({ ...p, [field]: value }))
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
      body: JSON.stringify({ ...form, vehicle_id: vehicleId }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to save sale')
      setSaving(false)
      return
    }

    router.refresh()
    onClose()
  }

  const isBhph = form.finance_type === 'bhph'
  const isFinance = form.finance_type === 'finance'

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
                  <Label>Down Payment</Label>
                  <Input type="number" placeholder="2000" value={form.down_payment}
                    onChange={e => update('down_payment', e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>Loan Amount</Label>
                  <Input type="number" placeholder="10000" value={form.loan_amount}
                    onChange={e => update('loan_amount', e.target.value)} className="h-11" />
                </div>
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
      </SheetContent>
    </Sheet>
  )
}
