'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardPaste, ExternalLink } from 'lucide-react'

interface SingleResult {
  isNew: boolean
  customerId: string
  name: string
  phone: string | null
  email: string | null
  note: string | null
  vehicle: string | null
  source: string
}

type Result = SingleResult | { multiple: true; results: SingleResult[] }

export default function PasteLeadDialog() {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [text, setText]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function handleSubmit() {
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      const res = await fetch('/api/leads/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setText('')
      setError(null)
      setResult(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Paste lead">
          <ClipboardPaste className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Paste Lead</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="flex flex-col gap-3 min-h-0">
            <p className="text-sm text-muted-foreground shrink-0">
              Paste a lead (CarGurus, AutoTrader, OfferUp, or any format). Name, phone, email, and vehicle are extracted automatically—AI handles unknown formats.
            </p>
            <Textarea
              placeholder="Paste lead text here..."
              value={text}
              onChange={e => setText(e.target.value)}
              className="font-mono text-xs resize-none overflow-y-auto"
              style={{ minHeight: 120, maxHeight: 320 }}
            />
            {error && (
              <p className="text-sm text-destructive shrink-0">{error}</p>
            )}
            <Button
              className="w-full shrink-0"
              onClick={handleSubmit}
              disabled={loading || text.trim().length < 10}
            >
              {loading ? 'Parsing…' : 'Parse & Import'}
            </Button>
          </div>
        ) : 'multiple' in result && result.multiple ? (
          <div className="space-y-4">
            <p className="font-semibold text-sm">
              ✅ {result.results.length} lead{result.results.length !== 1 ? 's' : ''} imported
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {result.results.map((r, i) => (
                <div
                  key={r.customerId + i}
                  className={`rounded-lg p-3 text-sm border ${r.isNew ? 'bg-green-50 dark:bg-green-950 border-green-200' : 'bg-card'}`}
                >
                  <p className="font-medium">{r.name}</p>
                  {r.vehicle && <p className="text-xs text-muted-foreground">{r.vehicle}</p>}
                  {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
                  {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 text-xs"
                    onClick={() => {
                      handleOpenChange(false)
                      router.push(`/customers/${r.customerId}`)
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View contact
                  </Button>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-lg p-3 text-sm ${(result as SingleResult).isNew ? 'bg-green-50 dark:bg-green-950' : 'bg-blue-50 dark:bg-blue-950'}`}>
              <p className="font-semibold mb-1">
                {(result as SingleResult).isNew ? '✅ New contact created' : '✅ Existing contact updated'}
              </p>
              <p><span className="text-muted-foreground">Name:</span> {(result as SingleResult).name}</p>
              {(result as SingleResult).phone   && <p><span className="text-muted-foreground">Phone:</span> {(result as SingleResult).phone}</p>}
              {(result as SingleResult).email   && <p><span className="text-muted-foreground">Email:</span> {(result as SingleResult).email}</p>}
              {(result as SingleResult).vehicle && <p><span className="text-muted-foreground">Vehicle:</span> {(result as SingleResult).vehicle}</p>}
              {(result as SingleResult).note    && <p><span className="text-muted-foreground">Message:</span> "{(result as SingleResult).note}"</p>}
              <p><span className="text-muted-foreground">Source:</span> {(result as SingleResult).source}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  handleOpenChange(false)
                  router.push(`/customers/${(result as SingleResult).customerId}`)
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View Contact
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
