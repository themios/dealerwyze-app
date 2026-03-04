'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface TransferInfo {
  id:                string
  org_name:          string
  initiated_by_name: string
  data_snapshot: {
    customers:    number
    vehicles:     number
    bhph_active:  number
    bhph_balance: number
    templates:    number
  } | null
  notes:      string | null
  expires_at: string
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function TransferClaimPage() {
  const { token }                       = useParams<{ token: string }>()
  const router                          = useRouter()
  const [loading, setLoading]           = useState(true)
  const [info,    setInfo]              = useState<TransferInfo | null>(null)
  const [notFound, setNotFound]         = useState(false)
  const [claiming, setClaiming]         = useState(false)
  const [claimed,  setClaimed]          = useState(false)
  const [error,    setError]            = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn]     = useState<boolean | null>(null)

  useEffect(() => {
    // Check auth status
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setIsLoggedIn(!!d?.id))
      .catch(() => setIsLoggedIn(false))

    // Fetch transfer info
    fetch(`/api/transfer/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setNotFound(true); return }
        setInfo(d)
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleClaim() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/transfer/${token}`)
      return
    }
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch(`/api/transfer/${token}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to claim transfer'); return }
      setClaimed(true)
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading transfer details…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Transfer Link Expired or Invalid</h1>
          <p className="text-sm text-muted-foreground">
            This transfer link has expired, been cancelled, or already been used.
            Contact the dealership owner for a new link.
          </p>
          <Link href="/" className="text-sm text-primary hover:underline">
            Return to DealerWyze
          </Link>
        </div>
      </div>
    )
  }

  if (claimed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
          <h1 className="text-xl font-semibold">Transfer Request Submitted</h1>
          <p className="text-sm text-muted-foreground">
            DealerWyze will review your request and complete the transfer within 1 business day.
            You&apos;ll receive access to <strong>{info?.org_name}</strong> once approved.
          </p>
          <Link href="/today" className="text-sm text-primary hover:underline">
            Go to your dashboard
          </Link>
        </div>
      </div>
    )
  }

  const snap = info?.data_snapshot

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">DealerWyze — Business Transfer</p>
          <h1 className="text-2xl font-bold">{info?.org_name}</h1>
          <p className="text-sm text-muted-foreground">
            Ownership transfer initiated by <strong>{info?.initiated_by_name}</strong>
          </p>
        </div>

        {/* What you're receiving */}
        {snap && (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">What you&apos;re receiving</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <p className="text-2xl font-bold">{snap.customers.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Customers &amp; Leads</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-2xl font-bold">{snap.vehicles.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Vehicles in Inventory</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-2xl font-bold">{snap.bhph_active.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Active BHPH Loans</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-2xl font-bold">{formatCurrency(snap.bhph_balance)}</p>
                <p className="text-xs text-muted-foreground">Outstanding BHPH Balance</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Full sales history, activities, templates, and ledger also included.
              Staff accounts are not transferred — you will manage your own team.
            </p>
          </div>
        )}

        {/* Notes from seller */}
        {info?.notes && (
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note from seller</p>
            <p className="text-sm">{info.notes}</p>
          </div>
        )}

        {/* Warning */}
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            By accepting, you agree to become the <strong>dealer admin</strong> for this account.
            DealerWyze will review and complete the transfer within 1 business day.
          </p>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        {/* CTA */}
        <Button
          className="w-full h-12 text-base"
          onClick={handleClaim}
          disabled={claiming || isLoggedIn === null}
        >
          {claiming
            ? 'Submitting…'
            : isLoggedIn
              ? 'Accept Transfer & Become Owner'
              : 'Sign In to Accept Transfer'
          }
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Need help? Contact{' '}
          <a href="mailto:support@dealerwyze.com" className="text-primary hover:underline">
            support@dealerwyze.com
          </a>
        </p>
      </div>
    </div>
  )
}
