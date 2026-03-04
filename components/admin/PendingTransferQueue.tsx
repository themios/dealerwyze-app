'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ArrowRight, AlertTriangle } from 'lucide-react'

interface Transfer {
  id:                      string
  org_name:                string
  status:                  'pending_claim' | 'pending_approval'
  new_owner_email:         string
  initiated_by_name:       string
  initiated_by_email:      string
  new_owner_name:          string | null
  new_owner_account_email: string | null
  data_snapshot: {
    customers:    number
    vehicles:     number
    bhph_active:  number
    bhph_balance: number
  } | null
  created_at: string
  token_expires_at: string
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PendingTransferQueue({ transfers: initial }: { transfers: Transfer[] }) {
  const router = useRouter()
  const [transfers,    setTransfers]    = useState(initial)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [loading,      setLoading]      = useState<string | null>(null)

  const pendingClaim    = transfers.filter(t => t.status === 'pending_claim')
  const pendingApproval = transfers.filter(t => t.status === 'pending_approval')

  async function approve(id: string) {
    setLoading(id)
    const res = await fetch(`/api/admin/transfers/${id}/approve`, { method: 'POST' })
    if (res.ok) {
      setTransfers(prev => prev.filter(t => t.id !== id))
      router.refresh()
    }
    setLoading(null)
  }

  async function reject(id: string) {
    setLoading(id)
    await fetch(`/api/admin/transfers/${id}/approve`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason: rejectReason || 'Transfer not approved.' }),
    })
    setTransfers(prev => prev.filter(t => t.id !== id))
    setRejectTarget(null)
    setRejectReason('')
    setLoading(null)
    router.refresh()
  }

  if (!transfers.length) return null

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        Ownership Transfers ({transfers.length})
      </h2>

      {/* Pending claim — just waiting for new owner to click the link */}
      {pendingClaim.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Awaiting claim by new owner</p>
          {pendingClaim.map(t => (
            <div key={t.id} className="rounded-lg border border-muted p-3 space-y-1 bg-card">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{t.org_name}</span>
                <Badge variant="secondary" className="text-xs">Awaiting Claim</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                From: {t.initiated_by_name} → To: {t.new_owner_email}
              </p>
              <p className="text-xs text-muted-foreground">
                Initiated {formatDate(t.created_at)} · Expires {formatDate(t.token_expires_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pending approval — new owner has claimed, ready to execute */}
      {pendingApproval.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Ready to approve</p>
          {pendingApproval.map(t => (
            <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{t.org_name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span>{t.initiated_by_name}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{t.new_owner_name ?? t.new_owner_email}</span>
                  </div>
                </div>
                <Badge className="text-xs">Ready to Approve</Badge>
              </div>

              {/* Data snapshot */}
              {t.data_snapshot && (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="text-center">
                    <p className="font-bold text-base">{t.data_snapshot.customers}</p>
                    <p className="text-muted-foreground">Customers</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-base">{t.data_snapshot.vehicles}</p>
                    <p className="text-muted-foreground">Vehicles</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-base">{t.data_snapshot.bhph_active}</p>
                    <p className="text-muted-foreground">BHPH</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-base">{formatCurrency(t.data_snapshot.bhph_balance)}</p>
                    <p className="text-muted-foreground">Outstanding</p>
                  </div>
                </div>
              )}

              {/* New owner details */}
              <div className="rounded bg-background/60 p-2 text-xs space-y-0.5">
                <p><span className="text-muted-foreground">New owner account: </span>
                  <span className="font-medium">{t.new_owner_name ?? 'Unknown'}</span>
                  {t.new_owner_account_email && <span className="text-muted-foreground"> ({t.new_owner_account_email})</span>}
                </p>
                <p><span className="text-muted-foreground">Initiated: </span>{formatDate(t.created_at)}</p>
              </div>

              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-100 dark:bg-amber-900/30 p-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Approving will deactivate <strong>{t.initiated_by_name}</strong> and grant
                  full dealer admin access to <strong>{t.new_owner_name ?? t.new_owner_email}</strong>.
                </p>
              </div>

              {/* Reject textarea */}
              {rejectTarget === t.id && (
                <Textarea
                  placeholder="Reason for rejection (shown to DealerWyze staff only)…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => approve(t.id)}
                  disabled={loading === t.id}
                  className="flex-1"
                >
                  {loading === t.id ? 'Approving…' : 'Approve Transfer'}
                </Button>

                {rejectTarget === t.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reject(t.id)}
                      disabled={loading === t.id}
                    >
                      Confirm Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setRejectTarget(null); setRejectReason('') }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejectTarget(t.id)}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
