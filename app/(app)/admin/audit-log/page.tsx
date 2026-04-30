'use client'

import { useEffect, useState, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Loader2, Search, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface LogEntry {
  id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
  admin_user_id: string
  target_org_id: string | null
  organizations: { name: string } | null
}

interface OrgOption { id: string; name: string }

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AuditLogPage() {
  const [entries, setEntries]   = useState<LogEntry[]>([])
  const [orgs, setOrgs]         = useState<OrgOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [orgFilter, setOrgFilter]   = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildUrl(q = query, org = orgFilter, from = fromDate, to = toDate) {
    const p = new URLSearchParams({ limit: '100' })
    if (q)   p.set('q', q)
    if (org) p.set('org_id', org)
    if (from) p.set('from', from)
    if (to)   p.set('to', to)
    return `/api/admin/audit-log?${p}`
  }

  function load(q = query, org = orgFilter, from = fromDate, to = toDate) {
    setLoading(true)
    fetch(buildUrl(q, org, from, to))
      .then(r => r.json())
      .then((d: LogEntry[]) => { setEntries(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false

    fetch(buildUrl())
      .then(r => r.json())
      .then((d: LogEntry[]) => {
        if (!cancelled) {
          setEntries(Array.isArray(d) ? d : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    fetch('/api/admin/orgs')
      .then(r => r.json())
      .then((d: OrgOption[]) => {
        if (!cancelled) setOrgs(Array.isArray(d) ? d.slice(0, 100) : [])
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(val), 350)
  }

  function applyFilters() {
    load()
  }

  function exportCsv() {
    const p = new URLSearchParams({ limit: '500', format: 'csv' })
    if (query)    p.set('q', query)
    if (orgFilter) p.set('org_id', orgFilter)
    if (fromDate) p.set('from', fromDate)
    if (toDate)   p.set('to', toDate)
    window.open(`/api/admin/audit-log?${p}`, '_blank')
  }

  return (
    <div>
      <TopBar title="Audit Log" />
      <div className="px-4 py-4 space-y-3 pb-24">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Filter by action…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* Filters row */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={orgFilter}
              onChange={e => setOrgFilter(e.target.value)}
            >
              <option value="">All orgs</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name || 'Unnamed'}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              className="flex-1 h-9 text-xs"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              className="flex-1 h-9 text-xs"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              placeholder="To"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No log entries.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="rounded-xl border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{e.action.replace(/_/g, ' ')}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(e.created_at)}</span>
                </div>
                {e.organizations?.name && (
                  <p className="text-xs text-muted-foreground">{e.organizations.name}</p>
                )}
                {e.details && Object.keys(e.details).length > 0 && (
                  <p className="text-[10px] text-muted-foreground font-mono break-all">
                    {JSON.stringify(e.details)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
