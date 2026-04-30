'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Copy, Check, Clock } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

interface DataSnapshot {
  customers: number
  vehicles: number
  bhph_active: number
  bhph_balance: number
  templates: number
}

interface ActiveTransfer {
  id: string
  new_owner_email: string
  status: 'pending_claim' | 'pending_approval'
  claim_url: string
  token_expires_at: string
  data_snapshot: DataSnapshot | null
  notes: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TransferPageClient({ initialTransfer }: { initialTransfer: ActiveTransfer | null }) {
  const [activeTransfer, setActiveTransfer] = useState<ActiveTransfer | null>(initialTransfer)
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleInitiate(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmed) return
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_email: email, notes }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate transfer link.')
        return
      }

      setActiveTransfer({
        id: data.id,
        claim_url: data.claim_url,
        token_expires_at: data.expires_at,
        new_owner_email: email,
        status: 'pending_claim',
        data_snapshot: null,
        notes: notes || null,
      })
      setEmail('')
      setNotes('')
      setConfirmed(false)
      setSaved(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    const res = await fetch('/api/settings/transfer', { method: 'DELETE' })
    setCancelling(false)
    if (!res.ok) {
      setError('Could not cancel the transfer. Please try again.')
      throw new Error('cancel_failed')
    }
    setActiveTransfer(null)
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return activeTransfer ? (
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

      <div className="space-y-1.5">
        <Label>Claim link — share with the new owner</Label>
        <div className="flex gap-2">
          <Input readOnly value={activeTransfer.claim_url} className="font-mono text-xs bg-muted" />
          <Button variant="outline" size="icon" onClick={() => copyUrl(activeTransfer.claim_url)}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The new owner opens this link, signs in or creates an account, and accepts the transfer.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ConfirmActionDialog
        title="Cancel business transfer?"
        description="This invalidates the current claim link and the new owner will no longer be able to accept the transfer."
        confirmLabel={cancelling ? 'Cancelling...' : 'Cancel transfer'}
        confirmVariant="destructive"
        onConfirm={handleCancel}
        trigger={(
          <Button variant="destructive" size="sm" disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel Transfer'}
          </Button>
        )}
      />
    </div>
  ) : (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-medium">What transfers to the new owner</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>All customers and leads</li>
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>Vehicle inventory</li>
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>BHPH contracts and payment history</li>
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>SMS and email templates</li>
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>Full ledger and sales history</li>
          <li className="flex items-center gap-2"><span className="text-green-600 font-bold">✓</span>Voice call recordings and transcripts</li>
          <li className="flex items-center gap-2"><span className="text-amber-500 font-bold">~</span>Phone number may need to be re-confirmed</li>
          <li className="flex items-center gap-2"><span className="text-red-500 font-bold">✗</span>Staff accounts do not transfer</li>
          <li className="flex items-center gap-2"><span className="text-red-500 font-bold">✗</span>Google Calendar and GBP connections must be reconnected</li>
        </ul>
      </div>

      <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4">
        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700 dark:text-red-400">
          Your account will be <strong>permanently deactivated</strong> once DealerWyze approves the transfer.
        </p>
      </div>

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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="text-sm text-green-700">Transfer link generated successfully.</p> : null}

        <Button type="submit" variant="destructive" disabled={submitting || !confirmed || !email} className="w-full">
          {submitting ? 'Generating transfer link…' : 'Generate Transfer Link'}
        </Button>
      </form>
    </div>
  )
}
