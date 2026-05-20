'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import type { DealerThread, ThreadStatus, ThreadType } from '@/app/(app)/admin/orgs/[id]/dealer-inbox.types'

export interface GlobalThread extends DealerThread {
  org_id: string
  org_name: string
}

const TYPE_BADGE: Record<ThreadType, string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

const STATUS_OPTIONS: { value: ThreadStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
]

const TYPE_OPTIONS: { value: ThreadType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'success', label: 'Success' },
  { value: 'support', label: 'Support' },
  { value: 'billing', label: 'Billing' },
  { value: 'sales', label: 'Sales' },
]

export default function AdminInboxClient() {
  const router = useRouter()
  const [threads, setThreads]       = useState<GlobalThread[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatus]   = useState<ThreadStatus>('open')
  const [typeFilter, setType]       = useState<ThreadType | 'all'>('all')

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (typeFilter !== 'all') params.set('thread_type', typeFilter)
      const res = await fetch(`/api/admin/inbox/threads?${params}`)
      if (res.ok) setThreads((await res.json()) as GlobalThread[])
      else setThreads([])
    } catch {
      setThreads([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => { void loadThreads() }, [loadThreads])

  const emptyLabel = typeFilter !== 'all'
    ? `No ${statusFilter} ${typeFilter} threads.`
    : `No ${statusFilter} threads.`

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Dealer Inbox</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  statusFilter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={typeFilter}
            onChange={e => setType(e.target.value as ThreadType | 'all')}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map(thread => (
              <li key={thread.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/orgs/${thread.org_id}`)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(`/admin/orgs/${thread.org_id}`)
                    }
                  }}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/orgs/${thread.org_id}`}
                        onClick={e => e.stopPropagation()}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {thread.org_name}
                      </Link>
                      <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', TYPE_BADGE[thread.thread_type])}>
                        {thread.thread_type}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">{thread.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {thread.unread_count > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {thread.unread_count}
                        </span>
                      )}
                      <span suppressHydrationWarning>
                        {formatRelativeTime(thread.updated_at)}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/admin/orgs/${thread.org_id}`}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Open ${thread.org_name}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
