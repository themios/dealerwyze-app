'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Transaction } from '@/lib/transactions/types'

interface Props {
  vehicleId:   string
  transaction?: Transaction | null
  onSave:      (t: Transaction) => void
  onCancel:    () => void
}

interface FormState {
  offer_amount:        string
  offer_date:          string
  inspection_deadline: string
  commission_pct:      string
  co_broke_pct:        string
  contingencies:       string   // comma-separated
  notes:               string
  closing_date:        string
  final_sale_price:    string
  buyer_agent:         string
  seller_agent:        string
  title_company:       string
  lender:              string
  parties_notes:       string
}

function txnToForm(t: Transaction | null | undefined): FormState {
  return {
    offer_amount:        t?.offer_amount        != null ? String(t.offer_amount) : '',
    offer_date:          t?.offer_date          ?? '',
    inspection_deadline: t?.inspection_deadline ?? '',
    commission_pct:      t?.commission_pct      != null ? String(t.commission_pct) : '3',
    co_broke_pct:        t?.co_broke_pct        != null ? String(t.co_broke_pct) : '3',
    contingencies:       t?.contingencies?.join(', ') ?? '',
    notes:               t?.notes ?? '',
    closing_date:        t?.closing_date        ?? '',
    final_sale_price:    t?.final_sale_price    != null ? String(t.final_sale_price) : '',
    buyer_agent:         t?.parties?.buyerAgent  ?? '',
    seller_agent:        t?.parties?.sellerAgent ?? '',
    title_company:       t?.parties?.titleCompany ?? '',
    lender:              t?.parties?.lender       ?? '',
    parties_notes:       t?.parties?.notes        ?? '',
  }
}

export default function TransactionForm({ vehicleId, transaction, onSave, onCancel }: Props) {
  const [form, setForm]       = useState<FormState>(txnToForm(transaction))
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [partiesOpen, setPartiesOpen] = useState(false)

  const isEdit = Boolean(transaction?.id)

  function upd(k: keyof FormState, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const contingenciesArr = form.contingencies
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const parties = {
      buyerAgent:   form.buyer_agent   || undefined,
      sellerAgent:  form.seller_agent  || undefined,
      titleCompany: form.title_company || undefined,
      lender:       form.lender        || undefined,
      notes:        form.parties_notes || undefined,
    }
    // Only include parties if at least one field is filled
    const hasParties = Object.values(parties).some(v => v !== undefined)

    const payload: Record<string, unknown> = {
      vehicle_id:          vehicleId,
      offer_amount:        form.offer_amount        ? parseFloat(form.offer_amount)        : null,
      offer_date:          form.offer_date          || null,
      inspection_deadline: form.inspection_deadline || null,
      commission_pct:      form.commission_pct      ? parseFloat(form.commission_pct)      : null,
      co_broke_pct:        form.co_broke_pct        ? parseFloat(form.co_broke_pct)        : null,
      contingencies:       contingenciesArr,
      notes:               form.notes               || null,
      closing_date:        form.closing_date        || null,
      final_sale_price:    form.final_sale_price    ? parseFloat(form.final_sale_price)    : null,
      parties:             hasParties ? parties : null,
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
        const data = await res.json().catch(() => ({}))
        setError((data as Record<string, string>).error ?? 'Something went wrong. Please try again.')
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="offer_amount">Offer Amount</Label>
          <Input
            id="offer_amount"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 450000"
            value={form.offer_amount}
            onChange={e => upd('offer_amount', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offer_date">Offer Date</Label>
          <Input
            id="offer_date"
            type="date"
            value={form.offer_date}
            onChange={e => upd('offer_date', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="inspection_deadline">Inspection Deadline</Label>
          <Input
            id="inspection_deadline"
            type="date"
            value={form.inspection_deadline}
            onChange={e => upd('inspection_deadline', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="commission_pct">Commission % (agent side)</Label>
          <Input
            id="commission_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="3"
            value={form.commission_pct}
            onChange={e => upd('commission_pct', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="co_broke_pct">Co-Broke %</Label>
          <Input
            id="co_broke_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="3"
            value={form.co_broke_pct}
            onChange={e => upd('co_broke_pct', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="contingencies">Contingencies</Label>
        <Input
          id="contingencies"
          placeholder="Financing, Inspection, Appraisal (comma-separated)"
          value={form.contingencies}
          onChange={e => upd('contingencies', e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={2}
          placeholder="Add any notes about this transaction..."
          value={form.notes}
          onChange={e => upd('notes', e.target.value)}
        />
      </div>

      {/* Closing details — visible to all agents */}
      <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closing Details</p>
        <p className="text-[11px] text-muted-foreground">
          Record the closing date and final price. Your broker will confirm close to finalize commissions.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="closing_date">Closing Date</Label>
            <Input
              id="closing_date"
              type="date"
              value={form.closing_date}
              onChange={e => upd('closing_date', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="final_sale_price">Final Sale Price</Label>
            <Input
              id="final_sale_price"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 455000"
              value={form.final_sale_price}
              onChange={e => upd('final_sale_price', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Parties — collapsible */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/50 hover:bg-muted/80 transition-colors"
          onClick={() => setPartiesOpen(p => !p)}
        >
          <span>Parties</span>
          <span className="text-muted-foreground text-xs">{partiesOpen ? '▲ hide' : '▼ show'}</span>
        </button>

        {partiesOpen && (
          <div className="p-3 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="buyer_agent">Buyer Agent</Label>
              <Input
                id="buyer_agent"
                placeholder="Name"
                value={form.buyer_agent}
                onChange={e => upd('buyer_agent', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seller_agent">Seller Agent</Label>
              <Input
                id="seller_agent"
                placeholder="Name"
                value={form.seller_agent}
                onChange={e => upd('seller_agent', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="title_company">Title Company</Label>
              <Input
                id="title_company"
                placeholder="Company name"
                value={form.title_company}
                onChange={e => upd('title_company', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lender">Lender</Label>
              <Input
                id="lender"
                placeholder="Lender name"
                value={form.lender}
                onChange={e => upd('lender', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="parties_notes">Parties notes</Label>
              <Textarea
                id="parties_notes"
                rows={2}
                placeholder="Any additional party info..."
                value={form.parties_notes}
                onChange={e => upd('parties_notes', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2">
          {error}
        </p>
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
