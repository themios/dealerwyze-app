'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Inbox, UserPlus, Archive, Trash2, RotateCcw,
  ChevronDown, ChevronUp, Car, Clock,
} from 'lucide-react'
import { toast } from 'sonner'

type InquiryStatus = 'new' | 'imported' | 'archived'

export interface WebLeadInquiry {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  source_url: string | null
  created_at: string
  status: InquiryStatus
  vehicle_id: string | null
  vehicle: {
    year: number | null
    make: string | null
    model: string | null
    public_slug: string | null
  } | null
}

type TabKey = 'all' | InquiryStatus

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'new',      label: 'New' },
  { key: 'imported', label: 'Imported' },
  { key: 'archived', label: 'Archived' },
]

const MESSAGE_TRUNCATE = 220

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(dateStr))
}

function StatusDot({ status }: { status: InquiryStatus }) {
  const cls =
    status === 'new'      ? 'bg-green-500' :
    status === 'imported' ? 'bg-blue-500'  :
                            'bg-muted-foreground/40'
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />
}

// ── Single card ───────────────────────────────────────────────────────────────

function LeadCard({
  inquiry,
  onStatusChange,
  onDelete,
}: {
  inquiry: WebLeadInquiry
  onStatusChange: (id: string, status: InquiryStatus) => void
  onDelete: (id: string) => void
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const vehicleName = inquiry.vehicle
    ? `${inquiry.vehicle.year ?? ''} ${inquiry.vehicle.make ?? ''} ${inquiry.vehicle.model ?? ''}`.trim()
    : null

  const message = inquiry.message ?? ''
  const isLong = message.length > MESSAGE_TRUNCATE
  const displayMessage = isLong && !expanded
    ? message.slice(0, MESSAGE_TRUNCATE).trimEnd() + '…'
    : message

  const importParams = new URLSearchParams()
  if (inquiry.name)  importParams.set('name',  inquiry.name)
  if (inquiry.phone) importParams.set('phone', inquiry.phone)
  if (inquiry.email) importParams.set('email', inquiry.email)

  async function patch(status: InquiryStatus) {
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/web/${inquiry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      onStatusChange(inquiry.id, status)
    } catch {
      toast.error('Could not update lead — try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/web/${inquiry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(inquiry.id)
      toast.success('Lead deleted')
    } catch {
      toast.error('Could not delete lead — try again.')
      setBusy(false)
    }
  }

  async function importLead() {
    // Mark as imported first, then navigate
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/web/${inquiry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'imported' }),
      })
      if (res.ok) onStatusChange(inquiry.id, 'imported')
    } catch {
      // non-fatal — still navigate
    } finally {
      setBusy(false)
    }
    router.push(`/customers/new?${importParams.toString()}`)
  }

  return (
    <div className={`px-4 py-3.5 transition-colors hover:bg-muted/20 ${inquiry.status === 'archived' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <StatusDot status={inquiry.status} />

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Row 1: name + contact + time */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              {inquiry.status === 'new' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 uppercase tracking-wide leading-none">
                  New
                </span>
              )}
              <span className="text-sm font-semibold text-foreground">
                {inquiry.name ?? 'Unknown'}
              </span>
              {inquiry.phone && (
                <a
                  href={`tel:${inquiry.phone}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {inquiry.phone}
                </a>
              )}
              {inquiry.email && (
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[200px]"
                >
                  {inquiry.email}
                </a>
              )}
            </div>
            <span className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground/60 whitespace-nowrap">
              <Clock className="h-3 w-3" aria-hidden />
              {relativeTime(inquiry.created_at)}
            </span>
          </div>

          {/* Row 2: vehicle */}
          {vehicleName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Car className="h-3 w-3 shrink-0" aria-hidden />
              {inquiry.vehicle_id ? (
                <Link
                  href={`/vehicles/${inquiry.vehicle_id}`}
                  className="text-primary hover:underline font-medium"
                >
                  {vehicleName}
                </Link>
              ) : (
                <span>{vehicleName}</span>
              )}
            </div>
          )}

          {/* Row 3: message */}
          {message && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground leading-relaxed">
              <p>{displayMessage}</p>
              {isLong && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {expanded
                    ? <><ChevronUp className="h-3 w-3" />Show less</>
                    : <><ChevronDown className="h-3 w-3" />Show more</>}
                </button>
              )}
            </div>
          )}

          {/* Row 4: actions */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {inquiry.status !== 'imported' ? (
              <button
                onClick={importLead}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                Import as Lead
              </button>
            ) : (
              <button
                onClick={importLead}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                Re-import
              </button>
            )}

            {inquiry.status !== 'archived' ? (
              <button
                onClick={() => patch('archived')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archive
              </button>
            ) : (
              <button
                onClick={() => patch('new')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Restore
              </button>
            )}

            {confirmDelete ? (
              <>
                <span className="text-xs text-destructive font-medium">Delete?</span>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs border border-border bg-background hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main list ─────────────────────────────────────────────────────────────────

export default function WebLeadsClient({ initialInquiries }: { initialInquiries: WebLeadInquiry[] }) {
  const [inquiries, setInquiries] = useState<WebLeadInquiry[]>(initialInquiries)
  const [activeTab, setActiveTab] = useState<TabKey>('new')

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: inquiries.length, new: 0, imported: 0, archived: 0 }
    for (const q of inquiries) c[q.status]++
    return c
  }, [inquiries])

  const visible = useMemo(() =>
    activeTab === 'all' ? inquiries : inquiries.filter(q => q.status === activeTab),
    [inquiries, activeTab],
  )

  const handleStatusChange = useCallback((id: string, status: InquiryStatus) => {
    setInquiries(prev => prev.map(q => q.id === id ? { ...q, status } : q))
  }, [])

  const handleDelete = useCallback((id: string) => {
    setInquiries(prev => prev.filter(q => q.id !== id))
  }, [])

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`text-[11px] rounded-full px-1.5 py-px leading-none font-semibold ${
                activeTab === tab.key
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {activeTab === 'all' ? 'No web leads yet.' : `No ${activeTab} leads.`}
          </p>
          {activeTab === 'all' && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              When customers contact you from your public website, they&apos;ll appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visible.map(inquiry => (
            <LeadCard
              key={inquiry.id}
              inquiry={inquiry}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
