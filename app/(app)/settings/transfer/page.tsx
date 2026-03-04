'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, AlertTriangle, Copy, Check, Clock } from 'lucide-react'

interface DataSnapshot {
  customers:    number
  vehicles:     number
  bhph_active:  number
  bhph_balance: number
  templates:    number
}

interface ActiveTransfer {
  id:              string
  new_owner_email: string
  status:          'pending_claim' | 'pending_approval'
  claim_url:       string
  token_expires_at:string
  data_snapshot:   DataSnapshot | null
  notes:           string | null
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TransferPage() {
  const router = useRouter()
  const [loading,          setLoading]          = useState(true)
  const [activeTransfer,   setActiveTransfer]   = useState<ActiveTransfer | null>(null)
  const [email,            setEmail]            = useState('')
  const [notes,            setNotes]            = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [cancelling,       setCancelling]       = useState(false)
  const [copied,           setCopied]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [confirmed,        setConfirmed]        = useState(false)

  useEffect(() => {
    fetch('/api/settings/transfer')
      .then(r => r.json())
      .then(d => setActiveTransfer(d.transfer ?? null))
      .finally(() => setLoading(false))
  }, [])

  async function handleInitiate(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmed) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_email: email, notes }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      // Refresh active transfer state
      const refreshed = await fetch('/api/settings/transfer').then(r => r.json())
      setActiveTransfer(refreshed.transfer ?? null)
      setEmail('')
      setNotes('')
      setConfirmed(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this transfer? The claim link will be invalidated.')) return
    setCancelling(true)
    await fetch('/api/settings/transfer', { method: 'DELETE' })
    setActiveTransfer(null)
    setCancelling(false)
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Transfer Business Ownership</h1>
          <p className="text-sm text-muted-foreground">Transfer this dealership to a new owner</p>
        </div>
      </div>

      {activeTransfer ? (
        /* ── State B: active transfer ── */
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Transfer in progress</p>
              <Badge variant={activeTransfer.status === 'pending_approval' ? 'default' : 'secondary'}>
                {activeTransfer.status === 'pending_approval' ? 'Claimed — Awaiting Approval' : 'Awaiting Claim'}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Sent to: <span className="font-medium text-foreground">{activeTransfer.new_owner_email}</span>
            </p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Expires {formatDate(activeTransfer.token_expires_at)}
            </div>
          </div>

          {/* Claim URL */}
          <div className="space-y-1.5">
            <Label>Claim link — share with the new owner</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={activeTransfer.claim_url}
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyUrl(activeTransfer.claim_url)}
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The new owner opens this link, signs in (or creates an account), and accepts the transfer.
              DealerWyze will review and complete it within 1 business day.
            </p>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling…' : 'Cancel Transfer'}
          </Button>
        </div>
      ) : (
        /* ── State A: initiate transfer ── */
        <div className="space-y-5">
          {/* What transfers card */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">What transfers to the new owner</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                All customers &amp; leads (history, notes, activities)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                Vehicle inventory
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                BHPH loan contracts &amp; payment history
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                SMS &amp; email templates
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                Full ledger &amp; sales history
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                Voice call recordings &amp; transcripts
              </li>
              <li className="flex items-center gap-2">
                <span className="text-amber-500 font-bold">~</span>
                Phone number (stays with the org — new owner may request change)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-red-500 font-bold">✗</span>
                Staff accounts — new owner manages their own team
              </li>
              <li className="flex items-center gap-2">
                <span className="text-red-500 font-bold">✗</span>
                Google Calendar &amp; GBP connections — must be reconnected
              </li>
            </ul>
          </div>

          {/* Warning */}
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">
              Your account will be <strong>permanently deactivated</strong> once DealerWyze approves the transfer.
              This cannot be undone.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleInitiate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-owner-email">New owner&apos;s email address</Label>
              <Input
                id="new-owner-email"
                type="email"
                placeholder="newowner@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                They will need to create a DealerWyze account (or sign in) to accept the transfer.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes for DealerWyze support (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Sale date, attorney contact, any special instructions…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="confirm-transfer"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <label htmlFor="confirm-transfer" className="text-sm text-muted-foreground cursor-pointer">
                I understand my account will be deactivated and this action is irreversible once approved.
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              variant="destructive"
              disabled={submitting || !confirmed || !email}
              className="w-full"
            >
              {submitting ? 'Generating transfer link…' : 'Generate Transfer Link'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
