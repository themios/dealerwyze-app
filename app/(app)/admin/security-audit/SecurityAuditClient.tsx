'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SecurityAuditRow {
  id: string
  actor_id: string | null
  actor_type: string
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'impersonation_start', label: 'impersonation_start' },
  { value: 'impersonation_end', label: 'impersonation_end' },
  { value: 'payment_confirmed', label: 'payment_confirmed' },
  { value: 'data_export', label: 'data_export' },
  { value: 'settings_updated', label: 'settings_updated' },
  { value: 'role_changed', label: 'role_changed' },
  { value: 'webhook_auth_failure', label: 'webhook_auth_failure' },
  { value: 'gmail_oidc_invalid', label: 'gmail_oidc_invalid' },
  { value: 'invalid_cron_secret', label: 'invalid_cron_secret' },
  { value: 'root_cause_reviewed', label: 'root_cause_reviewed' },
] as const

const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const

function truncateId(id: string | null | undefined, len: number) {
  if (!id) return '—'
  if (id.length <= len) return id
  return `${id.slice(0, len)}…`
}

function formatLocalTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function actionBadgeClass(action: string) {
  if (['webhook_auth_failure', 'gmail_oidc_invalid', 'invalid_cron_secret'].includes(action)) {
    return 'bg-destructive/15 text-destructive border border-destructive/30'
  }
  if (action === 'impersonation_start' || action === 'impersonation_end') {
    return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30'
  }
  if (action === 'role_changed') {
    return 'bg-orange-500/15 text-orange-900 dark:text-orange-200 border border-orange-500/30'
  }
  if (action === 'payment_confirmed') {
    return 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-600/25'
  }
  return 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/25'
}

function metadataPairs(meta: Record<string, unknown> | null): [string, string][] {
  if (!meta || typeof meta !== 'object') return []
  return Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 8)
    .map(([k, v]) => {
      let s: string
      if (typeof v === 'object') {
        try {
          s = JSON.stringify(v)
        } catch {
          s = String(v)
        }
      } else {
        s = String(v)
      }
      if (s.length > 80) s = `${s.slice(0, 80)}…`
      return [k, s] as [string, string]
    })
}

export default function SecurityAuditClient() {
  const [days, setDays] = useState<string>('30')
  const [action, setAction] = useState<string>('all')
  const [rows, setRows] = useState<SecurityAuditRow[]>([])
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const queryBase = useMemo(
    () => ({
      source: 'security',
      days,
      action: action === 'all' ? '' : action,
    }),
    [days, action],
  )

  const fetchPage = useCallback(
    async (append: boolean, beforeId: string | null) => {
      const params = new URLSearchParams()
      params.set('source', 'security')
      params.set('days', queryBase.days)
      if (queryBase.action) params.set('action', queryBase.action)
      params.set('limit', '50')
      if (beforeId) params.set('before_id', beforeId)

      const res = await fetch(`/api/audit?${params.toString()}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      }
      const entries = (data.entries ?? []) as SecurityAuditRow[]
      const more = !!data.has_more
      const next = (data.next_before_id ?? null) as string | null

      if (append) {
        setRows(prev => [...prev, ...entries])
      } else {
        setRows(entries)
      }
      setHasMore(more)
      setNextBeforeId(next)
    },
    [queryBase.action, queryBase.days],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        await fetchPage(false, null)
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [fetchPage])

  async function loadMore() {
    if (!nextBeforeId || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      await fetchPage(true, nextBeforeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoadingMore(false)
    }
  }

  function toggleMeta(id: string) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Security Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          High-risk actions recorded automatically: impersonation, payments, exports, settings changes, webhook failures.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 items-start sm:items-end border border-border rounded-lg bg-card p-4">
        <div className="space-y-1.5 min-w-[200px]">
          <Label>Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-10 w-[260px] max-w-full">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[180px]">
          <Label>Date range</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-10 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 w-[160px]">Time</th>
              <th className="px-3 py-2 w-[140px]">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2 min-w-[200px]">Details</th>
              <th className="px-3 py-2 w-[120px]">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No security events recorded in this period.
                </td>
              </tr>
            )}
            {!loading && rows.map(row => {
              const pairs = metadataPairs(row.metadata)
              const showAll = expanded[row.id]
              const visiblePairs = showAll ? pairs : pairs.slice(0, 3)
              const hasMoreMeta = pairs.length > 3
              return (
                <tr key={row.id} className="border-b border-border/80 last:border-0">
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {formatLocalTime(row.created_at)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={cn('inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md', actionBadgeClass(row.action))}>
                      {row.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span title={row.actor_id ?? undefined}>
                      {row.actor_type}/{truncateId(row.actor_id, 8)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span title={row.entity_id ?? undefined}>
                      {(row.entity_type ?? '—')} {row.entity_id ? truncateId(row.entity_id, 8) : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {pairs.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {visiblePairs.map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="font-medium text-foreground">{k}:</span>{' '}
                            <span className="text-muted-foreground break-all">{v}</span>
                          </div>
                        ))}
                        {hasMoreMeta && (
                          <button
                            type="button"
                            onClick={() => toggleMeta(row.id)}
                            className="text-xs text-primary hover:underline mt-1"
                          >
                            {showAll ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-muted-foreground">
                    {row.ip_address ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasMore && !loading && (
        <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
