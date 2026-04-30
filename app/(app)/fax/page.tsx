'use client'

import { useState, useEffect, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Printer, Upload, X, CheckCircle2, Clock, AlertCircle, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Fax {
  id: string
  to_number: string
  from_number: string
  status: string
  file_name: string
  num_pages: number | null
  error_msg: string | null
  created_at: string
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  queued:     { label: 'Queued',     color: 'text-yellow-400', icon: Clock },
  processing: { label: 'Processing', color: 'text-blue-400',   icon: Loader2 },
  sending:    { label: 'Sending',    color: 'text-blue-400',   icon: Loader2 },
  delivered:  { label: 'Delivered',  color: 'text-green-400',  icon: CheckCircle2 },
  'no-answer':{ label: 'No Answer',  color: 'text-orange-400', icon: AlertCircle },
  busy:       { label: 'Busy',       color: 'text-orange-400', icon: AlertCircle },
  failed:     { label: 'Failed',     color: 'text-red-400',    icon: AlertCircle },
  canceled:   { label: 'Canceled',   color: 'text-gray-400',   icon: X },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'text-gray-400', icon: Clock }
  const Icon = meta.icon
  const spinning = status === 'processing' || status === 'sending'
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', meta.color)}>
      <Icon className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
      {meta.label}
    </span>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function FaxPage() {
  const [to, setTo]         = useState('')
  const [file, setFile]     = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendOk, setSendOk] = useState(false)
  const [history, setHistory] = useState<Fax[]>([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchHistory = async () => {
    try {
      const r = await fetch('/api/fax')
      if (r.ok) setHistory(await r.json())
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/fax')
        if (r.ok) setHistory(await r.json())
      } catch {
        // Ignore initial history load failures
      }
      setLoading(false)
    })()
    // Poll every 15s while any fax is in-progress
    const id = setInterval(() => {
      setHistory(prev => {
        const hasInFlight = prev.some(f => ['queued','processing','sending'].includes(f.status))
        if (hasInFlight) fetchHistory()
        return prev
      })
    }, 15_000)
    return () => clearInterval(id)
  }, [])

  const handleSend = async () => {
    setSendError('')
    setSendOk(false)

    const digits = to.replace(/\D/g, '')
    if (digits.length < 10) { setSendError('Enter a valid 10-digit fax number.'); return }
    if (!file) { setSendError('Select a PDF or image to fax.'); return }

    setSending(true)
    const form = new FormData()
    form.append('file', file)
    form.append('to', to)

    const r = await fetch('/api/fax/send', { method: 'POST', body: form })
    const data = await r.json()
    setSending(false)

    if (!r.ok) {
      setSendError(data.error ?? 'Failed to send fax.')
      return
    }

    setSendOk(true)
    setTo('')
    setFile(null)
    fetchHistory()
    setTimeout(() => setSendOk(false), 4000)
  }

  const inFlight = history.some(f => ['queued','processing','sending'].includes(f.status))

  return (
    <div>
      <TopBar title="Fax" />
      <div className="p-4 space-y-5">

        {/* Compose */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Printer className="h-4 w-4 text-cyan-400" />
            Send a Fax
          </h2>

          <Input
            placeholder="Fax number  e.g. 818-555-1234"
            value={to}
            onChange={e => setTo(e.target.value)}
            type="tel"
            inputMode="tel"
          />

          {/* File picker */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-3 rounded-lg border-2 border-dashed border-border hover:border-cyan-400/60 p-3 text-left transition-colors"
          >
            {file ? (
              <>
                <FileText className="h-5 w-5 text-cyan-400 flex-shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Tap to attach PDF or image</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/tiff"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />

          {sendError && <p className="text-xs text-red-400">{sendError}</p>}
          {sendOk    && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Fax queued — delivery usually takes 1–3 minutes.</p>}

          <Button
            onClick={handleSend}
            disabled={sending || !to || !file}
            className="w-full"
          >
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send Fax'}
          </Button>
        </div>

        {/* History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">History</p>
            {inFlight && <span className="text-xs text-blue-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Updating…</span>}
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No faxes sent yet.</p>
          ) : (
            history.map(fax => (
              <div key={fax.id} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{fax.to_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{fax.file_name}{fax.num_pages ? ` · ${fax.num_pages}p` : ''}</p>
                  {fax.error_msg && <p className="text-xs text-red-400 truncate">{fax.error_msg}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <StatusBadge status={fax.status} />
                  <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>{timeAgo(fax.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
