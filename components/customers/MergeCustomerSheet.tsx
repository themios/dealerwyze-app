'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge, Search, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatPhone } from '@/lib/utils'

interface Customer {
  id: string
  name: string
  primary_phone: string | null
  email?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  sourceCustomer: Customer
}

export default function MergeCustomerSheet({ open, onClose, sourceCustomer }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSelected(null)
      setMerging(false)
      setError(null)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim() || selected) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}&limit=20`)
        const data = await res.json() as Customer[]
        // Exclude the source customer from results
        setResults((data ?? []).filter(c => c.id !== sourceCustomer.id))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selected, sourceCustomer.id])

  async function handleMerge() {
    if (!selected) return
    setMerging(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${sourceCustomer.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_customer_id: selected.id }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; target_customer_id?: string }
      if (!res.ok) {
        setError(data.error ?? 'Merge failed. Please try again.')
        setMerging(false)
        return
      }
      onClose()
      router.push(`/customers/${data.target_customer_id}`)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setMerging(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v && !merging) onClose() }}>
      <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            Merge Contact
          </SheetTitle>
        </SheetHeader>

        {!selected ? (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <p className="text-sm text-muted-foreground">
              Search for the contact to keep. All history from <span className="font-medium text-foreground">{sourceCustomer.name}</span> will move to them.
            </p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                placeholder="Search by name or phone..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {searching && (
                <p className="text-sm text-muted-foreground px-1 py-2">Searching...</p>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-2">No contacts found.</p>
              )}
              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border bg-card hover:bg-accent transition-colors"
                >
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.primary_phone ? formatPhone(c.primary_phone) : 'No phone'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">This cannot be undone</p>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 pl-6">
                All activity, tasks, documents, and vehicles from <span className="font-semibold">{sourceCustomer.name}</span> will move to <span className="font-semibold">{selected.name}</span>. {sourceCustomer.name} will be archived.
              </p>
            </div>

            <div className="space-y-2">
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Archived (source)</p>
                <p className="text-sm font-medium">{sourceCustomer.name}</p>
                {sourceCustomer.primary_phone && (
                  <p className="text-xs text-muted-foreground">{formatPhone(sourceCustomer.primary_phone)}</p>
                )}
              </div>
              <div className="flex items-center justify-center">
                <GitMerge className="h-5 w-5 text-muted-foreground rotate-180" />
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 space-y-1">
                <p className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">Kept (target)</p>
                <p className="text-sm font-medium">{selected.name}</p>
                {selected.primary_phone && (
                  <p className="text-xs text-muted-foreground">{formatPhone(selected.primary_phone)}</p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 mt-auto">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setSelected(null); setError(null) }}
                disabled={merging}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-[#0D2B55] hover:bg-[#0D2B55]/90 text-white"
                onClick={handleMerge}
                disabled={merging}
              >
                {merging ? 'Merging...' : `Merge into ${selected.name}`}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
