'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, RefreshCw } from 'lucide-react'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

interface AuditEntry {
  id: string
  actor_id: string | null
  actor_type: string
  action: string
  details: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

interface AuditResponse {
  entries: AuditEntry[]
  has_more: boolean
}

const ACTION_LABELS: Record<string, string> = {
  impersonation_start:         'Staff impersonation started',
  impersonation_end:           'Staff impersonation ended',
  bhph_payment_finalized:      'BHPH payment received',
  data_export:                 'Data exported',
  org_settings_updated:        'Org settings changed',
  appearance_settings_updated: 'Appearance settings changed',
  automation_settings_updated: 'Automation settings changed',
  webhook_created:             'Webhook created',
  webhook_deleted:             'Webhook deleted',
  gmail_auth_failure:          'Gmail auth failure',
  user_invited:                'User invited',
  user_deactivated:            'User deactivated',
  user_role_changed:           'User role changed',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function actorLabel(entry: AuditEntry) {
  if (entry.actor_type === 'staff')   return 'Staff'
  if (entry.actor_type === 'system')  return 'System'
  if (entry.actor_type === 'webhook') return 'Webhook'
  return entry.actor_id ? `User ${entry.actor_id.slice(0, 8)}…` : 'Unknown'
}

const ACTOR_BADGE: Record<string, string> = {
  staff:   'bg-purple-100 text-purple-700',
  system:  'bg-gray-100 text-gray-600',
  webhook: 'bg-blue-100 text-blue-700',
  user:    'bg-green-100 text-green-700',
}

async function fetchAuditEntries(action: string, beforeId?: string): Promise<AuditResponse | null> {
  const params = new URLSearchParams({ limit: '50' })
  if (beforeId) params.set('before_id', beforeId)
  if (action !== 'all') params.set('action', action)
  const res = await fetch(`/api/audit?${params}`)
  if (!res.ok) return null
  return res.json() as Promise<AuditResponse>
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [action, setAction] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const actionRef = useRef(action)

  useEffect(() => {
    actionRef.current = action
    let cancelled = false
    fetchAuditEntries(action).then(data => {
      if (cancelled) return
      if (!data) { setError('Could not load audit log.'); setLoading(false); return }
      setEntries(data.entries)
      setHasMore(data.has_more)
      setError(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [action])

  function handleActionChange(val: string) {
    setLoading(true)
    setEntries([])
    setError(null)
    setAction(val)
  }

  function handleRefresh() {
    setLoading(true)
    setEntries([])
    setError(null)
    setAction(prev => {
      // Toggling to a sentinel and back would be messy; instead force re-run via a ref trick.
      // Since action hasn't changed we manually invoke the fetch.
      const cur = prev
      fetchAuditEntries(cur).then(data => {
        if (!data) { setError('Could not load audit log.'); setLoading(false); return }
        setEntries(data.entries)
        setHasMore(data.has_more)
        setError(null)
        setLoading(false)
      })
      return prev
    })
  }

  async function loadMore() {
    const cursor = entries[entries.length - 1]?.id
    if (!cursor) return
    setLoadingMore(true)
    const data = await fetchAuditEntries(actionRef.current, cursor)
    if (data) {
      setEntries(prev => [...prev, ...data.entries])
      setHasMore(data.has_more)
    }
    setLoadingMore(false)
  }

  return (
    <SettingsPageShell
      title="Audit Log"
      description="Security, billing, export, and settings-change history for this dealership."
      type="ops"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span className="text-sm">Security event history for your dealership</span>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={action} onValueChange={handleActionChange}>
            <SelectTrigger className="w-56 h-8 text-sm">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No events found{action !== 'all' ? ' for this filter' : ''}.
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Event</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Actor</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">IP</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-xs">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTOR_BADGE[e.actor_type] ?? ACTOR_BADGE.user}`}>
                        {actorLabel(e)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {e.ip ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-xs truncate">
                      {e.details ? JSON.stringify(e.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {hasMore && (
              <div className="border-t px-4 py-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsPageShell>
  )
}
