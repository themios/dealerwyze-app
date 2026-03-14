'use client'

import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Share2, Search, Send, Check } from 'lucide-react'

interface Customer {
  id: string
  name: string
  primary_phone: string
}

interface Props {
  vehicleId: string
  vehicleLabel: string
  publicUrl: string
}

export default function ShareVehicleSheet({ vehicleId, vehicleLabel, publicUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [message, setMessage] = useState(`Check out this vehicle I have for you: ${vehicleLabel}\n${publicUrl}`)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchCustomers = async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}&limit=30`)
      if (res.ok) setCustomers(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchCustomers(search), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, open])

  const openSheet = () => {
    setOpen(true)
    setSelected(null)
    setSent(false)
    setError(null)
  }

  const send = async () => {
    if (!selected) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.primary_phone,
          body: message,
          customer_id: selected.id,
          vehicle_id: vehicleId,
        }),
      })
      if (res.ok) {
        setSent(true)
        setTimeout(() => setOpen(false), 1500)
      } else {
        const d = await res.json()
        setError(d.error ?? 'Failed to send — please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openSheet} title="Share via text">
        <Share2 className="h-4 w-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[82vh] flex flex-col gap-0 p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <SheetTitle className="text-base">Share via text</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Search */}
              <div className="px-4 py-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Customer list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Loading...</p>
                ) : customers.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No customers found</p>
                ) : (
                  customers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b hover:bg-accent text-left transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.primary_phone}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden px-4 py-4 gap-4">
              {/* Selected customer */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.primary_phone}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Change
                </button>
              </div>

              {/* Message editor */}
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  className="flex-1 w-full p-3 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                onClick={send}
                disabled={sending || sent || !message.trim()}
                className="w-full"
              >
                {sent ? (
                  <><Check className="h-4 w-4 mr-2" /> Sent!</>
                ) : sending ? 'Sending...' : (
                  <><Send className="h-4 w-4 mr-2" /> Send text</>
                )}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
