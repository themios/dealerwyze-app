'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { Loader2 } from 'lucide-react'

interface AdminTicket {
  id: string
  subject: string
  status: string
  priority: string
  created_at: string
  sla_breach_at: string | null
  first_staff_response_at: string | null
  organizations: { name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  normal: '',
  low:    'bg-gray-50 text-gray-400',
}

const FILTERS = ['all', 'open', 'in_progress', 'resolved', 'closed']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function slaBadge(ticket: AdminTicket): { label: string; cls: string } | null {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return null
  if (ticket.first_staff_response_at) return null  // SLA met
  if (!ticket.sla_breach_at) return null

  const msLeft = new Date(ticket.sla_breach_at).getTime() - Date.now()
  if (msLeft < 0) {
    return { label: 'SLA BREACHED', cls: 'bg-red-600 text-white' }
  }
  const hLeft = Math.floor(msLeft / 3600000)
  const mLeft = Math.floor((msLeft % 3600000) / 60000)
  if (hLeft < 1) {
    return { label: `${mLeft}m left`, cls: 'bg-orange-500 text-white' }
  }
  if (hLeft < 4) {
    return { label: `${hLeft}h ${mLeft}m left`, cls: 'bg-yellow-500 text-white' }
  }
  return null  // Plenty of time — no badge needed
}

export default function AdminTicketsPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('open')

  useEffect(() => {
    fetch('/api/admin/tickets')
      .then(r => r.json())
      .then((d: AdminTicket[]) => { setTickets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const urgentCount = tickets.filter(t => t.priority === 'urgent' && t.status === 'open').length
  const breachedCount = tickets.filter(t => {
    if (t.status === 'resolved' || t.status === 'closed' || t.first_staff_response_at) return false
    return t.sla_breach_at ? new Date(t.sla_breach_at) < new Date() : false
  }).length

  return (
    <div>
      <TopBar title={`Tickets${urgentCount ? ` (${urgentCount} urgent)` : ''}`} />
      <div className="px-4 py-4 space-y-4 pb-24">

        {breachedCount > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2">
            <p className="text-xs font-medium text-red-700">⚠ {breachedCount} ticket{breachedCount !== 1 ? 's' : ''} past SLA — respond now</p>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {f === 'all' ? `All (${tickets.length})` : f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No tickets.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => {
              const sla = slaBadge(t)
              const isBreached = sla?.label === 'SLA BREACHED'
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/admin/tickets/${t.id}`)}
                  className={`w-full text-left rounded-xl border p-3 space-y-1.5 active:opacity-70 ${isBreached ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'bg-card'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">{t.organizations?.name ?? '—'}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[t.status] ?? 'bg-gray-100'}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.priority !== 'normal' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[t.priority] ?? ''}`}>
                        {t.priority}
                      </span>
                    )}
                    {sla && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sla.cls}`} suppressHydrationWarning>
                        {sla.label}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{fmtDate(t.created_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
