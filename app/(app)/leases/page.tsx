'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/lib/transactions/types'

const STATUS_LABELS: Record<string, string> = {
  application: 'Application',
  approved:    'Approved',
  lease_signed:'Lease Signed',
  active:      'Active',
  expired:     'Expired',
  cancelled:   'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  application:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  approved:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  lease_signed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  active:       'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  expired:      'bg-muted text-muted-foreground',
  cancelled:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<(Transaction & { vehicle?: { address_line1: string | null; city: string | null } })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/transactions?transaction_type=lease')
        if (!res.ok) { setError('Unable to load leases. Please refresh.'); return }
        const data = await res.json() as { transactions: typeof leases }
        setLeases(data.transactions ?? [])
      } catch {
        setError('Network error. Please check your connection.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const filtered = filter === 'all' ? leases : leases.filter(l => l.pipeline_status === filter)

  return (
    <div>
      <TopBar title="Leases" />
      <div className="px-4 py-4 space-y-4">

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'application', 'approved', 'lease_signed', 'active', 'expired'].map(s => (
            <button key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'}`}>
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <p className="text-muted-foreground text-sm">No leases found.</p>
            <p className="text-xs text-muted-foreground">Open a listing and create a Lease / Rental transaction to get started.</p>
          </div>
        )}

        {filtered.map(lease => {
          const address = [lease.vehicle?.address_line1, lease.vehicle?.city].filter(Boolean).join(', ') || 'Unknown property'
          const statusClass = STATUS_COLORS[lease.pipeline_status] ?? 'bg-muted text-muted-foreground'
          return (
            <Link key={lease.id} href={`/vehicles/${lease.vehicle_id}#vehicle-detail-transactions`}
              className="block rounded-lg border bg-card p-4 hover:bg-accent/30 transition-colors space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{address}</p>
                  <p className="text-xs text-muted-foreground font-mono">{lease.transaction_number ?? lease.id.slice(0,8)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                  {STATUS_LABELS[lease.pipeline_status] ?? lease.pipeline_status}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                {lease.monthly_rent != null && <span>{formatCurrency(lease.monthly_rent)}/mo</span>}
                {lease.lease_term_months && <span>{lease.lease_term_months} months</span>}
                {lease.move_in_date && <span>Move-in: {new Date(lease.move_in_date).toLocaleDateString()}</span>}
                {lease.parties?.buyerName && <span>Tenant: {lease.parties.buyerName}</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
