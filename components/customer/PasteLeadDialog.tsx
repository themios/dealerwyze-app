'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardPaste, ExternalLink } from 'lucide-react'

interface Result {
  isNew: boolean
  customerId: string
  name: string
  phone: string | null
  email: string | null
  note: string | null
  vehicle: string | null
  source: string
}

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
              Paste an OfferUp or AutoTrader lead. Name, phone, email, and vehicle will be extracted automatically.
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
        ) : (
          <div className="space-y-4">
            <div className={`rounded-lg p-3 text-sm ${result.isNew ? 'bg-green-50 dark:bg-green-950' : 'bg-blue-50 dark:bg-blue-950'}`}>
              <p className="font-semibold mb-1">
                {result.isNew ? '✅ New contact created' : '✅ Existing contact updated'}
              </p>
              <p><span className="text-muted-foreground">Name:</span> {result.name}</p>
              {result.phone   && <p><span className="text-muted-foreground">Phone:</span> {result.phone}</p>}
              {result.email   && <p><span className="text-muted-foreground">Email:</span> {result.email}</p>}
              {result.vehicle && <p><span className="text-muted-foreground">Vehicle:</span> {result.vehicle}</p>}
              {result.note    && <p><span className="text-muted-foreground">Message:</span> "{result.note}"</p>}
              <p><span className="text-muted-foreground">Source:</span> {result.source}</p>
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
                  router.push(`/customers/${result.customerId}`)
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
