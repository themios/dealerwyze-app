'use client'

import { useEffect, useState } from 'react'
import { Download, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type LostLeadRow = {
  id: string
  archived_at: string
  archive_reason: string
  loss_reason: string | null
  intent_tier: string | null
  intent_score: number | null
  touches: number | null
  days_since_last_reply: number | null
  ai_root_cause_status: string
  root_cause: null | {
    failure_mode: string | null
    coaching_note: string | null
    confidence: number | null
    needs_review: boolean
  }
  customer: { id: string; name: string; interested_in: string | null } | null
  assigned_rep: { id: string; display_name: string } | null
  last_actor: { id: string; display_name: string } | null
}

type LostLeadResponse = {
  rows: LostLeadRow[]
  nextCursor: string | null
  summary: {
    totalLost: number
    avgIntentScore: number
    mostCommonArchiveReason: string | null
    mostCommonLossReason: string | null
    reinstateRate: number
  }
  reps: Array<{ id: string; display_name: string }>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function LostLeadsClient() {
  const [data, setData] = useState<LostLeadResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [assignedRepId, setAssignedRepId] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [lossReason, setLossReason] = useState('')
  const [intentTier, setIntentTier] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  async function load(cursor?: string | null) {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (assignedRepId) params.set('assigned_rep_id', assignedRepId)
    if (archiveReason) params.set('archive_reason', archiveReason)
    if (lossReason) params.set('loss_reason', lossReason)
    if (intentTier) params.set('intent_tier', intentTier)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`/api/admin/performance/lost-leads?${params}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reinstate(auditId: string) {
    const reason = window.prompt('Why are you reinstating this lead?')
    if (!reason) return
    const res = await fetch('/api/admin/leads/reinstate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId, reason }),
    })
    if (res.ok) void load()
  }

  async function markReviewed(auditId: string) {
    const res = await fetch('/api/admin/performance/lost-leads/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId }),
    })
    if (res.ok) void load()
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' })
    if (assignedRepId) params.set('assigned_rep_id', assignedRepId)
    if (archiveReason) params.set('archive_reason', archiveReason)
    if (lossReason) params.set('loss_reason', lossReason)
    if (intentTier) params.set('intent_tier', intentTier)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    window.open(`/api/admin/performance/lost-leads?${params}`, '_blank')
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-5">
        <div>
          <p className="text-xs text-muted-foreground">Total lost</p>
          <p className="text-2xl font-semibold">{data?.summary.totalLost ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg intent score</p>
          <p className="text-2xl font-semibold">{data?.summary.avgIntentScore ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Common archive reason</p>
          <p className="text-sm font-medium">{data?.summary.mostCommonArchiveReason ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Common loss reason</p>
          <p className="text-sm font-medium">{data?.summary.mostCommonLossReason ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reinstate rate</p>
          <p className="text-2xl font-semibold">{data?.summary.reinstateRate ?? 0}%</p>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-6">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={assignedRepId} onChange={e => setAssignedRepId(e.target.value)}>
          <option value="">All reps</option>
          {data?.reps.map(rep => <option key={rep.id} value={rep.id}>{rep.display_name}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={archiveReason} onChange={e => setArchiveReason(e.target.value)}>
          <option value="">All archive reasons</option>
          {['ghost', 'manual', 'post_last_ditch', 'bulk'].map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={lossReason} onChange={e => setLossReason(e.target.value)}>
          <option value="">All loss reasons</option>
          {['price', 'timing', 'competitor', 'not_ready', 'no_contact', 'other'].map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={intentTier} onChange={e => setIntentTier(e.target.value)}>
          <option value="">All intent tiers</option>
          {['standard', 'active', 'warm', 'hot'].map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        <div className="md:col-span-6 flex gap-2">
          <Button size="sm" onClick={() => void load()}>Apply Filters</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading lost leads…</p>
        ) : data?.rows.length ? data.rows.map(row => (
          <div key={row.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.customer?.name ?? 'Unknown customer'}</p>
                <p className="text-sm text-muted-foreground">{row.customer?.interested_in ?? 'No vehicle on record'}</p>
                <p className="text-xs text-muted-foreground">
                  Assigned: {row.assigned_rep?.display_name ?? 'Unassigned'} · Last actor: {row.last_actor?.display_name ?? 'None'}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{fmtDate(row.archived_at)}</p>
                <p>{row.ai_root_cause_status}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2 py-1">{row.archive_reason}</span>
              <span className="rounded-full bg-muted px-2 py-1">{row.loss_reason ?? 'no loss reason'}</span>
              <span className="rounded-full bg-muted px-2 py-1">intent {row.intent_score ?? 0}</span>
              <span className="rounded-full bg-muted px-2 py-1">{row.touches ?? 0} touches</span>
              <span className="rounded-full bg-muted px-2 py-1">
                {row.days_since_last_reply == null ? 'no reply history' : `${row.days_since_last_reply}d since reply`}
              </span>
            </div>

            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-1">Root cause</p>
              {!row.root_cause ? (
                <p className="text-xs text-muted-foreground">Pending</p>
              ) : row.root_cause.needs_review ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-yellow-100 text-yellow-900 px-2 py-1 text-xs">
                    Low confidence — verify manually
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void markReviewed(row.id)}>
                    Mark reviewed
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {row.root_cause.failure_mode ?? 'unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confidence {row.root_cause.confidence == null ? '—' : `${Math.round(row.root_cause.confidence * 100)}%`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${Math.round((row.root_cause.confidence ?? 0) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{row.root_cause.coaching_note ?? '—'}</p>
                </div>
              )}
            </div>

            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => void reinstate(row.id)}>
                <RotateCcw className="mr-1 h-4 w-4" />Reinstate
              </Button>
            </div>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">No lost leads found.</p>
        )}
      </div>

      {data?.nextCursor && (
        <Button variant="outline" onClick={() => void load(data.nextCursor)}>Load More</Button>
      )}
    </div>
  )
}
