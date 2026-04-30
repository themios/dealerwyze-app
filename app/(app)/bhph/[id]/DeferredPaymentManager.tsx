'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface DeferredPaymentRow {
  id: string
  amount: number
  due_date: string
  status: 'scheduled' | 'paid' | 'cancelled'
  notes: string | null
  paid_at: string | null
  paid_amount: number | null
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function badgeClass(status: DeferredPaymentRow['status']) {
  if (status === 'paid') return 'bg-green-500/10 text-green-700 dark:text-green-400'
  if (status === 'cancelled') return 'bg-muted text-muted-foreground'
  return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
}

export default function DeferredPaymentManager({
  contractId,
  rows,
}: {
  contractId: string
  rows: DeferredPaymentRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [newDueDate, setNewDueDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const outstanding = rows
    .filter(row => row.status === 'scheduled')
    .reduce((sum, row) => sum + row.amount, 0)

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function addInstallment() {
    const amount = parseFloat(newAmount || '0')
    if (!(amount > 0) || !newDueDate) return
    await fetch('/api/bhph/deferred', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bhph_id: contractId,
        amount,
        due_date: newDueDate,
        notes: newNotes || null,
      }),
    })
    setNewDueDate('')
    setNewAmount('')
    setNewNotes('')
    refresh()
  }

  async function markPaid(id: string, amount: number) {
    await fetch(`/api/bhph/deferred/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paid_amount: amount }),
    })
    refresh()
  }

  async function cancelInstallment(id: string) {
    await fetch(`/api/bhph/deferred/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    refresh()
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deferred down payment</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Outstanding: <span className="font-semibold text-foreground">{fmt(outstanding)}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deferred installments scheduled.</p>
          ) : (
            rows.map(row => (
              <div key={row.id} className="rounded-lg border p-3 bg-background space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{fmt(row.amount)}</p>
                    <p className="text-xs text-muted-foreground">Due {new Date(`${row.due_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    {row.notes && <p className="text-xs text-muted-foreground mt-1">{row.notes}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                {row.status === 'scheduled' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => markPaid(row.id, row.amount)} disabled={isPending}>Mark paid</Button>
                    <Button size="sm" variant="outline" onClick={() => cancelInstallment(row.id)} disabled={isPending}>Cancel</Button>
                  </div>
                )}
                {row.status === 'paid' && row.paid_at && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Paid {new Date(row.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {fmt(row.paid_amount ?? row.amount)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add deferred installment</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="h-10" placeholder="500" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Input value={newNotes} onChange={e => setNewNotes(e.target.value)} className="h-10" placeholder="Optional note" />
        </div>
        <Button onClick={addInstallment} disabled={isPending || !newDueDate || !newAmount}>Add installment</Button>
      </div>
    </div>
  )
}
