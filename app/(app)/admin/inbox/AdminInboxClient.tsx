'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import DealerThreadView from '@/app/(app)/admin/orgs/[id]/DealerThreadView'
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
  const [threads, setThreads]             = useState<GlobalThread[]>([])
  const [loading, setLoading]             = useState(true)
  const [statusFilter, setStatus]         = useState<ThreadStatus>('open')
  const [typeFilter, setType]             = useState<ThreadType | 'all'>('all')
  const [selectedThread, setSelectedThread] = useState<GlobalThread | null>(null)
  const [showDetail, setShowDetail]       = useState(false)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (typeFilter !== 'all') params.set('thread_type', typeFilter)
      const res = await fetch(`/api/admin/inbox/threads?${params}`)
      if (res.ok) {
        const data = (await res.json()) as GlobalThread[]
        setThreads(data)
        // Auto-select highest unread thread on initial load
        setSelectedThread(prev => {
          if (prev) {
            const refreshed = data.find(t => t.id === prev.id)
            return refreshed ?? (data.length > 0 ? data.reduce((a, b) => b.unread_count > a.unread_count ? b : a) : null)
          }
          if (data.length === 0) return null
          return data.reduce((a, b) => b.unread_count > a.unread_count ? b : a)
        })
      } else {
        setThreads([])
      }
    } catch {
      setThreads([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => { void loadThreads() }, [loadThreads])

  function handleThreadClick(thread: GlobalThread) {
    setSelectedThread(thread)
    setShowDetail(true)
  }

  function handleBack() {
    setShowDetail(false)
  }

  function handleThreadUpdated(updated: DealerThread) {
    if (!selectedThread) return
    const merged: GlobalThread = { ...selectedThread, ...updated }
    setSelectedThread(merged)
    setThreads(prev => prev.map(t => t.id === merged.id ? merged : t))
  }

  const emptyLabel = typeFilter !== 'all'
    ? `No ${statusFilter} ${typeFilter} threads.`
    : `No ${statusFilter} threads.`

  const threadList = (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-4 border-b space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setStatus(opt.value); setSelectedThread(null) }}
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
            onChange={e => { setType(e.target.value as ThreadType | 'all'); setSelectedThread(null) }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map(thread => (
              <li key={thread.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleThreadClick(thread)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleThreadClick(thread)
                    }
                  }}
                  className={cn(
                    'flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors',
                    selectedThread?.id === thread.id
                      ? 'bg-muted'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{thread.org_name}</span>
                      <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', TYPE_BADGE[thread.thread_type])}>
                        {thread.thread_type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{thread.subject}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn(
                        'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                        thread.unread_count > 0
                          ? 'bg-red-500 text-white'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {thread.unread_count > 0 ? `${thread.unread_count} / ` : ''}{thread.message_count}
                      </span>
                      <span suppressHydrationWarning>
                        {formatRelativeTime(thread.updated_at)}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/admin/orgs/${thread.org_id}`}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Open ${thread.org_name} org page`}
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

  const detailPanel = selectedThread ? (
    <div className="p-4 h-full overflow-y-auto">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{selectedThread.org_name}</span>
        <Link
          href={`/admin/orgs/${selectedThread.org_id}`}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Open ${selectedThread.org_name} org page`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <DealerThreadView
        orgId={selectedThread.org_id}
        thread={selectedThread}
        onBack={handleBack}
        onThreadUpdated={handleThreadUpdated}
      />
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <MessageSquare className="h-10 w-10 opacity-30" />
      <p className="text-sm">Select a conversation</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-4 border-b">
        <h1 className="text-2xl font-semibold text-foreground">Dealer Inbox</h1>
      </div>

      {/* Desktop split-pane */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        <div className="w-80 shrink-0 border-r overflow-hidden flex flex-col">
          {threadList}
        </div>
        <div className="flex-1 overflow-hidden">
          {detailPanel}
        </div>
      </div>

      {/* Mobile: thread list or detail */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden md:hidden">
        {showDetail && selectedThread ? detailPanel : threadList}
      </div>
    </div>
  )
}
