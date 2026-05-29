'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useVertical } from '@/hooks/useVertical'
import YTDSummaryCard from '@/components/commissions/YTDSummaryCard'
import CommissionSummaryTable, { type CommissionSummaryRow } from '@/components/commissions/CommissionSummaryTable'
import { formatCurrency } from '@/lib/utils'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

interface AgentSummary {
  agent_id: string
  agent_name: string | null
  ytd_total: number
  deal_count: number
}

interface SummaryResponse {
  year: number
  ytd_total: number
  transactions: CommissionSummaryRow[]
  agents_summary?: AgentSummary[]
}

interface MeResponse {
  role?: string
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2]

/**
 * /commissions — YTD commission summary page.
 * TXN-07: agents see own deals and YTD total.
 * TXN-08: broker/admin sees all agents summary + org-wide deal table.
 * Dealer orgs are redirected to home.
 */
export default function CommissionsPage() {
  const router = useRouter()
  const { vertical } = useVertical()

  const [role, setRole] = useState<UserRole | null>(null)
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Fetch caller role from /api/auth/me
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: MeResponse | null) => {
        if (d?.role) setRole(d.role as UserRole)
      })
      .catch(() => {})
  }, [])

  // Redirect dealer orgs
  useEffect(() => {
    if (vertical === 'dealer') {
      router.replace('/today')
    }
  }, [vertical, router])

  const load = useCallback(async (selectedYear: number) => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/transactions/summary?year=${selectedYear}`)
      if (res.status === 403) {
        router.replace('/today')
        return
      }
      if (!res.ok) {
        setFetchError('Unable to load commission data. Please refresh.')
        return
      }
      const json = await res.json() as SummaryResponse
      setData(json)
    } catch {
      setFetchError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (vertical === 'real_estate') {
      void load(year)
    }
  }, [year, vertical, load])

  if (vertical === 'dealer') return null

  const isAdmin = role ? isDealerAdmin(role) : false
  const dealCount = data?.transactions.length ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Commissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? 'All agents — closed deal commission summary.' : 'Your closed deal commission summary.'}
          </p>
        </div>
        {/* Year selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="text-sm text-muted-foreground whitespace-nowrap">
            Year
          </label>
          <select
            id="year-select"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {YEAR_OPTIONS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        /* Loading skeleton */
        <div className="space-y-4">
          <div className="h-32 rounded-xl border bg-muted animate-pulse" />
          <div className="h-48 rounded-xl border bg-muted animate-pulse" />
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{fetchError}</p>
          <button
            onClick={() => load(year)}
            className="mt-3 text-sm text-primary underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : data ? (
        <>
          {/* YTD summary card */}
          <YTDSummaryCard ytdTotal={data.ytd_total} year={data.year} dealCount={dealCount} />

          {/* Admin: per-agent breakdown section (TXN-08) */}
          {isAdmin && data.agents_summary && data.agents_summary.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Agent Breakdown</h2>
              <div className="divide-y">
                {data.agents_summary.map(agent => (
                  <div key={agent.agent_id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {agent.agent_name ?? 'Unknown agent'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {agent.deal_count === 1 ? '1 deal' : `${agent.deal_count} deals`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(agent.ytd_total)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deal-by-deal table */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Closed Transactions</h2>
            <CommissionSummaryTable transactions={data.transactions} isAdmin={isAdmin} />
          </div>
        </>
      ) : null}
    </div>
  )
}
