'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Transaction, TransactionType } from '@/lib/transactions/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useRef } from 'react'

interface Props {
  vehicleId:    string
  agentId?:     string
  transaction?: Transaction | null
  onSave:       (t: Transaction) => void
  onCancel:     () => void
}

interface FormState {
  transaction_type:    TransactionType
  // Sale
  offer_amount:        string
  offer_date:          string
  inspection_deadline: string
  commission_pct:      string
  co_broke_pct:        string
  contingencies:       string
  closing_date:        string
  final_sale_price:    string
  // Lease
  monthly_rent:        string
  security_deposit:    string
  lease_term_months:   string
  move_in_date:        string
  lease_end_date:      string
  // Shared
  notes:               string
  // Parties
  buyer_name:          string
  buyer_phone:         string
  buyer_email:         string
  buyer_agent:         string
  seller_agent:        string
  title_company:       string
  lender:              string
  parties_notes:       string
}

function txnToForm(t: Transaction | null | undefined): FormState {
  return {
    transaction_type:    t?.transaction_type ?? 'sale',
    offer_amount:        t?.offer_amount        != null ? String(t.offer_amount) : '',
    offer_date:          t?.offer_date          ?? '',
    inspection_deadline: t?.inspection_deadline ?? '',
    commission_pct:      t?.commission_pct      != null ? String(t.commission_pct) : '3',
    co_broke_pct:        t?.co_broke_pct        != null ? String(t.co_broke_pct) : '',
    contingencies:       t?.contingencies?.join(', ') ?? '',
    closing_date:        t?.closing_date        ?? '',
    final_sale_price:    t?.final_sale_price    != null ? String(t.final_sale_price) : '',
    monthly_rent:        t?.monthly_rent        != null ? String(t.monthly_rent) : '',
    security_deposit:    t?.security_deposit    != null ? String(t.security_deposit) : '',
    lease_term_months:   t?.lease_term_months   != null ? String(t.lease_term_months) : '',
    move_in_date:        t?.move_in_date        ?? '',
    lease_end_date:      t?.lease_end_date      ?? '',
    notes:               t?.notes              ?? '',
    buyer_name:          t?.parties?.buyerName  ?? '',
    buyer_phone:         t?.parties?.buyerPhone ?? '',
    buyer_email:         t?.parties?.buyerEmail ?? '',
    buyer_agent:         t?.parties?.buyerAgent  ?? '',
    seller_agent:        t?.parties?.sellerAgent ?? '',
    title_company:       t?.parties?.titleCompany ?? '',
    lender:              t?.parties?.lender       ?? '',
    parties_notes:       t?.parties?.notes        ?? '',
  }
}

export default function TransactionForm({ vehicleId, agentId, transaction, onSave, onCancel }: Props) {
  const [form, setForm]         = useState<FormState>(txnToForm(transaction))
  const isLease = form.transaction_type === 'lease'
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [partiesOpen, setPartiesOpen] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; primary_phone: string | null; email: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (customerQuery.length < 2) { setCustomerResults([]); return }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerQuery)}&limit=8`)
      if (res.ok) setCustomerResults(await res.json())
    }, 250)
  }, [customerQuery])

  const isEdit = Boolean(transaction?.id)

  function upd(k: keyof FormState, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function fieldClass(field: string) {
    return fieldErrors[field] ? 'border-destructive focus-visible:ring-destructive' : ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setSaving(true)

    const contingenciesArr = form.contingencies
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const parties = {
      buyerName:    form.buyer_name    || undefined,
      buyerPhone:   form.buyer_phone   || undefined,
      buyerEmail:   form.buyer_email   || undefined,
      buyerAgent:   form.buyer_agent   || undefined,
      sellerAgent:  form.seller_agent  || undefined,
      titleCompany: form.title_company || undefined,
      lender:       form.lender        || undefined,
      notes:        form.parties_notes || undefined,
    }
    const hasParties = Object.values(parties).some(v => v !== undefined)

    const payload: Record<string, unknown> = {
      vehicle_id:          vehicleId,
      transaction_type:    form.transaction_type,
      listing_agent_id:    !isEdit && agentId ? agentId : undefined,
      notes:               form.notes || null,
      contingencies:       contingenciesArr,
      parties:             hasParties ? parties : null,
    }

    if (isLease) {
      payload.monthly_rent      = form.monthly_rent      ? parseFloat(form.monthly_rent)      : null
      payload.security_deposit  = form.security_deposit  ? parseFloat(form.security_deposit)  : null
      payload.lease_term_months = form.lease_term_months ? parseInt(form.lease_term_months)   : null
      payload.move_in_date      = form.move_in_date      || null
      payload.lease_end_date    = form.lease_end_date    || null
    } else {
      payload.offer_amount        = form.offer_amount        ? parseFloat(form.offer_amount)     : null
      payload.offer_date          = form.offer_date          || null
      payload.inspection_deadline = form.inspection_deadline || null
      payload.commission_pct      = form.commission_pct      ? parseFloat(form.commission_pct)  : null
      payload.co_broke_pct        = form.co_broke_pct        ? parseFloat(form.co_broke_pct)    : null
      payload.closing_date        = form.closing_date        || null
      payload.final_sale_price    = form.final_sale_price    ? parseFloat(form.final_sale_price) : null
    }

    try {
      const url    = isEdit ? `/api/transactions/${transaction!.id}` : '/api/transactions'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; fieldErrors?: Record<string, string> }
        if (data.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
          setFieldErrors(data.fieldErrors)
          setError('Please fix the highlighted fields below.')
        } else {
          setError(data.error ?? 'Something went wrong. Please try again.')
        }
        return
      }

      const saved: Transaction = await res.json()
      onSave(saved)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Transaction type — only shown when creating */}
      {!isEdit && (
        <div className="space-y-1">
          <Label>Transaction Type</Label>
          <Select value={form.transaction_type} onValueChange={v => upd('transaction_type', v as TransactionType)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="lease">Lease / Rental</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sale fields */}
      {!isLease && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="offer_amount">Offer Amount</Label>
              <Input id="offer_amount" type="number" min={0} step="0.01" placeholder="e.g. 450000"
                value={form.offer_amount}
                onChange={e => { upd('offer_amount', e.target.value); setFieldErrors(p => ({ ...p, offer_amount: '' })) }}
                className={fieldClass('offer_amount')} />
              {fieldErrors.offer_amount && <p className="text-xs text-destructive">{fieldErrors.offer_amount}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="offer_date">Offer Date</Label>
              <Input id="offer_date" type="date" value={form.offer_date}
                onChange={e => { upd('offer_date', e.target.value); setFieldErrors(p => ({ ...p, offer_date: '' })) }}
                className={fieldClass('offer_date')} />
              {fieldErrors.offer_date && <p className="text-xs text-destructive">{fieldErrors.offer_date}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="inspection_deadline">Inspection Deadline</Label>
              <Input id="inspection_deadline" type="date" value={form.inspection_deadline}
                onChange={e => upd('inspection_deadline', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="commission_pct">Commission % (agent)</Label>
              <Input id="commission_pct" type="number" min={0} max={100} step="0.01" placeholder="3"
                value={form.commission_pct}
                onChange={e => upd('commission_pct', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="co_broke_pct">Co-Broke %</Label>
              <Input id="co_broke_pct" type="number" min={0} max={100} step="0.01" placeholder="0"
                value={form.co_broke_pct}
                onChange={e => upd('co_broke_pct', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="contingencies">Contingencies</Label>
            <Input id="contingencies" placeholder="Financing, Inspection, Appraisal (comma-separated)"
              value={form.contingencies} onChange={e => upd('contingencies', e.target.value)} />
          </div>
          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closing Details</p>
            <p className="text-[11px] text-muted-foreground">Record the closing date and final price. Your broker will confirm close to finalize commissions.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="closing_date">Closing Date</Label>
                <Input id="closing_date" type="date" value={form.closing_date}
                  onChange={e => { upd('closing_date', e.target.value); setFieldErrors(p => ({ ...p, closing_date: '' })) }}
                  className={fieldClass('closing_date')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="final_sale_price">Final Sale Price</Label>
                <Input id="final_sale_price" type="number" min={0} step="0.01" placeholder="e.g. 455000"
                  value={form.final_sale_price}
                  onChange={e => { upd('final_sale_price', e.target.value); setFieldErrors(p => ({ ...p, final_sale_price: '' })) }}
                  className={fieldClass('final_sale_price')} />
                {fieldErrors.final_sale_price && <p className="text-xs text-destructive">{fieldErrors.final_sale_price}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lease fields */}
      {isLease && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="monthly_rent">Monthly Rent *</Label>
            <Input id="monthly_rent" type="number" min={0} step="0.01" placeholder="e.g. 2500"
              value={form.monthly_rent}
              onChange={e => { upd('monthly_rent', e.target.value); setFieldErrors(p => ({ ...p, monthly_rent: '' })) }}
              className={fieldClass('monthly_rent')} />
            {fieldErrors.monthly_rent && <p className="text-xs text-destructive">{fieldErrors.monthly_rent}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="security_deposit">Security Deposit</Label>
            <Input id="security_deposit" type="number" min={0} step="0.01" placeholder="e.g. 5000"
              value={form.security_deposit} onChange={e => upd('security_deposit', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lease_term_months">Lease Term (months)</Label>
            <Input id="lease_term_months" type="number" min={1} placeholder="12"
              value={form.lease_term_months} onChange={e => upd('lease_term_months', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="move_in_date">Move-in Date</Label>
            <Input id="move_in_date" type="date" value={form.move_in_date}
              onChange={e => upd('move_in_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lease_end_date">Lease End Date</Label>
            <Input id="lease_end_date" type="date" value={form.lease_end_date}
              onChange={e => upd('lease_end_date', e.target.value)} />
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={2} placeholder="Add any notes about this transaction..."
          value={form.notes} onChange={e => upd('notes', e.target.value)} />
      </div>

      {/* Parties — collapsible, includes buyer/tenant contact */}
      <div className="border rounded-lg overflow-hidden">
        <button type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/50 hover:bg-muted/80 transition-colors"
          onClick={() => setPartiesOpen(p => !p)}>
          <span>{isLease ? 'Tenant & Parties' : 'Buyer & Parties'}</span>
          <span className="text-muted-foreground text-xs">{partiesOpen ? '▲ hide' : '▼ show'}</span>
        </button>
        {partiesOpen && (
          <div className="p-3 space-y-3">
            {/* Buyer / Tenant contact */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isLease ? 'Tenant' : 'Buyer'}</p>

            {/* Lead search picker */}
            <div className="relative space-y-1">
              <Label>Search leads</Label>
              <Input
                placeholder="Type a name or phone to find a lead…"
                value={customerQuery}
                onChange={e => { setCustomerQuery(e.target.value); setShowResults(true) }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                className="h-9 text-sm"
              />
              {showResults && customerResults.length > 0 && (
                <div className="absolute z-50 w-full top-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onMouseDown={() => {
                        upd('buyer_name',  c.name)
                        upd('buyer_phone', c.primary_phone ?? '')
                        upd('buyer_email', c.email ?? '')
                        setCustomerQuery('')
                        setCustomerResults([])
                        setShowResults(false)
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.primary_phone && <span className="text-muted-foreground ml-2 text-xs">{c.primary_phone}</span>}
                      {c.email && <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="buyer_name">{isLease ? 'Tenant Name' : 'Buyer Name'}</Label>
                <Input id="buyer_name" placeholder="Full name"
                  value={form.buyer_name} onChange={e => upd('buyer_name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="buyer_phone">Phone</Label>
                <Input id="buyer_phone" type="tel" placeholder="(805) 555-0100"
                  value={form.buyer_phone} onChange={e => upd('buyer_phone', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="buyer_email">Email</Label>
                <Input id="buyer_email" type="email" placeholder="buyer@example.com"
                  value={form.buyer_email} onChange={e => upd('buyer_email', e.target.value)} />
              </div>
            </div>
            {/* Agents & vendors */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Agents & Vendors</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="buyer_agent">{isLease ? 'Tenant Agent' : 'Buyer Agent'}</Label>
                <Input id="buyer_agent" placeholder="Name"
                  value={form.buyer_agent} onChange={e => upd('buyer_agent', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seller_agent">{isLease ? 'Listing Agent' : 'Seller Agent'}</Label>
                <Input id="seller_agent" placeholder="Name"
                  value={form.seller_agent} onChange={e => upd('seller_agent', e.target.value)} />
              </div>
              {!isLease && (
                <div className="space-y-1">
                  <Label htmlFor="title_company">Title Company</Label>
                  <Input id="title_company" placeholder="Company name"
                    value={form.title_company} onChange={e => upd('title_company', e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="lender">{isLease ? 'Co-signer / Guarantor' : 'Lender'}</Label>
                <Input id="lender" placeholder="Name"
                  value={form.lender} onChange={e => upd('lender', e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="parties_notes">Additional notes</Label>
                <Textarea id="parties_notes" rows={2} placeholder="Any additional party info..."
                  value={form.parties_notes} onChange={e => upd('parties_notes', e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 space-y-1">
          <p>{error}</p>
          {Object.entries(fieldErrors).filter(([, msg]) => msg).map(([field, msg]) => (
            <p key={field} className="text-xs">• <strong>{field.replace(/_/g, ' ')}</strong>: {msg}</p>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Transaction'}
        </Button>
      </div>
    </form>
  )
}
