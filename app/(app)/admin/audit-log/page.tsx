'use client'

import { useEffect, useState, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface LogEntry {
  id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
  admin_user_id: string
  target_org_id: string | null
  organizations: { name: string } | null
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function load(q = '') {
    setLoading(true)
    fetch(`/api/admin/audit-log?q=${encodeURIComponent(q)}&limit=100`)
      .then(r => r.json())
      .then((d: LogEntry[]) => { setEntries(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleSearch(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(val), 350)
  }

  return (
    <div>
      <TopBar title="Audit Log" />
      <div className="px-4 py-4 space-y-4 pb-24">

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
                  <p className="text-[10px] text-muted-foreground font-mono">
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
