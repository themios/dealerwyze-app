'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  vehicleId: string
  initialPrice: number | null
}

export default function InlinePriceEdit({ vehicleId, initialPrice }: Props) {
  const [price, setPrice] = useState<number | null>(initialPrice)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(price != null ? String(price) : '')
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [editing, price])

  async function save() {
    const parsed = parseFloat(draft)
    const newPrice = draft.trim() === '' ? null : isNaN(parsed) ? null : parsed
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setPrice(newPrice)
      setEditing(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-muted-foreground">$</span>
          <input
            ref={inputRef}
            type="number"
            step="100"
            min="0"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            className="w-36 text-3xl font-bold bg-transparent border-b-2 border-primary outline-none"
            placeholder="0"
          />
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button onClick={save} className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancel} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 group"
      title="Tap to edit price"
    >
      {price != null ? (
        <p className="text-3xl font-bold">{formatCurrency(price)}</p>
      ) : (
        <p className="text-muted-foreground">No price set</p>
      )}
      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
