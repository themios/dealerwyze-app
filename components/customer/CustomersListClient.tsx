'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Customer } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Phone, CheckSquare, Square, X, UserCheck, Archive, ArrowUp, ArrowDown, Paperclip, ChevronRight, Flame } from 'lucide-react'
import { formatPhone, leadAgeBadge, lastContactBadge } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { LEAD_STATE_CONFIG, LEAD_STATES, type LeadState } from '@/lib/leads/states'
import CustomerQuickUploadSheet from './CustomerQuickUploadSheet'

/** Returns Tailwind bg class based on hours since last activity */
function activityUrgencyBg(lastActivityAt: string | null | undefined): string {
  if (!lastActivityAt) return 'bg-gray-300'
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3600000
  if (hours < 24) return 'bg-green-400'
  if (hours < 72) return 'bg-yellow-400'
  return 'bg-red-400'
}

const SOURCE_LABELS: Record<string, string> = {
  cargurus: 'CarGurus', cargurus_digest: 'CG Digest',
  autotrader: 'AutoTrader', offerup: 'OfferUp',
  facebook: 'Facebook', kbb: 'KBB', autolist: 'Autolist', carsforsale: 'Carsforsale',
  voice: 'Voice', manual: 'Manual', direct: 'Direct',
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtRespTime(secs: number | null | undefined): { text: string; cls: string } {
  if (secs == null) return { text: '—', cls: 'text-muted-foreground' }
  const total = Math.max(0, Math.floor(secs))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const text = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
  const cls = secs < 300 ? 'text-green-600' : secs < 600 ? 'text-yellow-600' : 'text-destructive'
  return { text, cls }
}

interface Agent {
  id: string
  display_name: string
  role: string
}

interface Props {
  customers: Customer[]
  isAdmin: boolean
  agents: Agent[]
  lastActivityMap?: Record<string, string>
  lastCallMap?: Record<string, string>
  lastSmsMap?: Record<string, string>
  lastEmailMap?: Record<string, string>
  showArchived?: boolean
}

type SortOption =
  | 'created_at'
  | 'name'
  | 'response_time'
  | 'last_activity'
  | 'last_call'
  | 'last_sms'
  | 'last_email'
type SortDirection = 'asc' | 'desc'
type StatusFilter =
  | 'all' | 'new_lead' | 'contacted' | 'engaged'
  | 'appointment_set' | 'appointment_confirmed'
  | 'showed' | 'sold' | 'lost' | 'dormant'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all:                   'All',
  new_lead:              'New',
  contacted:             'Contacted',
  engaged:               'Interested',
  appointment_set:       'Appt Set',
  appointment_confirmed: 'Negotiating',
  showed:                'Showed',
  sold:                  'Sold',
  lost:                  'Lost',
  dormant:               'Dormant',
}

const SORT_LABELS: Record<SortOption, string> = {
  created_at: 'Lead Created',
  name: 'Name',
  response_time: 'Response Time',
  last_activity: 'Last Activity',
  last_call: 'Last Call',
  last_sms: 'Last SMS',
  last_email: 'Last Email',
}

const SORT_OPTIONS: SortOption[] = [
  'created_at',
  'name',
  'response_time',
  'last_activity',
  'last_call',
  'last_sms',
  'last_email',
]

const SORT_STORAGE_KEY = 'customers_sort_v1'

function compareDateLike(a: string | null | undefined, b: string | null | undefined, dir: SortDirection): number {
  const aa = a ?? ''
  const bb = b ?? ''
  return dir === 'asc' ? aa.localeCompare(bb) : bb.localeCompare(aa)
}

function sortCustomers(
  customers: Customer[],
  sort: SortOption,
  direction: SortDirection,
  maps: {
    lastActivityMap: Record<string, string>
    lastCallMap: Record<string, string>
    lastSmsMap: Record<string, string>
    lastEmailMap: Record<string, string>
  },
): Customer[] {
  const copy = [...customers]

  switch (sort) {
    case 'created_at':
      return copy.sort((a, b) => compareDateLike(a.created_at, b.created_at, direction))
    case 'name':
      return copy.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name)
        return direction === 'asc' ? cmp : -cmp
      })
    case 'response_time':
      return copy.sort((a, b) => {
        const av = a.response_time_seconds ?? Number.POSITIVE_INFINITY
        const bv = b.response_time_seconds ?? Number.POSITIVE_INFINITY
        return direction === 'asc' ? av - bv : bv - av
      })
    case 'last_activity':
      return copy.sort((a, b) => {
        const la = maps.lastActivityMap[a.id] ?? a.created_at
        const lb = maps.lastActivityMap[b.id] ?? b.created_at
        return compareDateLike(la, lb, direction)
      })
    case 'last_call':
      return copy.sort((a, b) => {
        const la = maps.lastCallMap[a.id] ?? ''
        const lb = maps.lastCallMap[b.id] ?? ''
        const cmp = compareDateLike(la, lb, direction)
        return cmp !== 0 ? cmp : compareDateLike(a.created_at, b.created_at, 'desc')
      })
    case 'last_sms':
      return copy.sort((a, b) => {
        const la = maps.lastSmsMap[a.id] ?? ''
        const lb = maps.lastSmsMap[b.id] ?? ''
        const cmp = compareDateLike(la, lb, direction)
        return cmp !== 0 ? cmp : compareDateLike(a.created_at, b.created_at, 'desc')
      })
    case 'last_email':
      return copy.sort((a, b) => {
        const la = maps.lastEmailMap[a.id] ?? ''
        const lb = maps.lastEmailMap[b.id] ?? ''
        const cmp = compareDateLike(la, lb, direction)
        return cmp !== 0 ? cmp : compareDateLike(a.created_at, b.created_at, 'desc')
      })
  }
}

export default function CustomersListClient({
  customers: initial,
  isAdmin,
  agents,
  lastActivityMap = {},
  lastCallMap = {},
  lastSmsMap = {},
  lastEmailMap = {},
  showArchived = false,
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>(initial)
  const [sort, setSort] = useState<SortOption>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [isPending, startTransition] = useTransition()
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [uploadCustomerId, setUploadCustomerId] = useState<string | null>(null)
  const [stagePickerCustomer, setStagePickerCustomer] = useState<string | null>(null)
  const [savingStage, setSavingStage] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  function startLongPress(customerId: string) {
    longPressTimer.current = setTimeout(() => setStagePickerCustomer(customerId), 600)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  async function handleStageChange(newState: string) {
    if (!stagePickerCustomer || savingStage) return
    setSavingStage(true)
    const id = stagePickerCustomer
    setStagePickerCustomer(null)
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, thread_state: newState } : c))
    await fetch(`/api/customers/${id}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState }),
    })
    setSavingStage(false)
  }

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SORT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { sort?: SortOption; direction?: SortDirection }
      if (parsed.sort && SORT_OPTIONS.includes(parsed.sort)) setSort(parsed.sort)
      if (parsed.direction === 'asc' || parsed.direction === 'desc') setSortDirection(parsed.direction)
    } catch {
      // Ignore invalid persisted sort state
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        SORT_STORAGE_KEY,
        JSON.stringify({ sort, direction: sortDirection }),
      )
    } catch {
      // Ignore storage write failures
    }
  }, [sort, sortDirection])

  const agentMap = useMemo(
    () => Object.fromEntries(agents.map(a => [a.id, a.display_name])),
    [agents]
  )

  const sorted = sortCustomers(
    statusFilter === 'all'
      ? customers
      : customers.filter(c => (c.thread_state ?? 'new_lead') === statusFilter),
    sort,
    sortDirection,
    { lastActivityMap, lastCallMap, lastSmsMap, lastEmailMap },
  )

  const sortableColumnMap: Partial<Record<'name' | 'last_active' | 'response_time', SortOption>> = {
    name: 'name',
    last_active: 'last_activity',
    response_time: 'response_time',
  }

  function handleHeaderSort(column: keyof typeof sortableColumnMap) {
    const next = sortableColumnMap[column]
    if (!next) return
    setSort(next)
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAssign = () => {
    if (!selected.size) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase
        .from('customers')
        .update({ assigned_to: assignTo || null })
        .in('id', Array.from(selected))
      setSelected(new Set())
      setSelectMode(false)
      setAssignTo('')
    })
  }

  const exitSelect = () => {
    setSelected(new Set())
    setSelectMode(false)
  }

  async function handleArchive(id: string) {
    const supabase = createClient()
    await supabase
      .from('customers')
      .update({ archived: true, archived_reason: archiveReason || null })
      .eq('id', id)
    setCustomers(prev => prev.filter(c => c.id !== id))
    setArchiveConfirm(null)
    setArchiveReason('')
    router.refresh()
  }

  return (
    <div className="page-enter">
      {/* Archive toggle link */}
      <div className="px-4 pt-2 pb-0 flex justify-end">
        {showArchived ? (
          <Link href="/customers" className="text-xs text-primary flex items-center gap-1">
            ← Active Customers
          </Link>
        ) : (
          <Link href="/customers?archived=1" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Archive className="h-3 w-3" />
            Show Archived
          </Link>
        )}
      </div>

      {/* Status filter — hidden in archived view */}
      {!showArchived && (
        <div className="px-4 pt-2 pb-1 flex items-center gap-2 overflow-x-auto">
          {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(opt => {
            const count = opt === 'all'
              ? customers.length
              : customers.filter(c => (c.thread_state ?? 'new_lead') === opt).length
            return (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                aria-pressed={statusFilter === opt}
                className={`text-xs px-2.5 py-1 rounded-full flex-shrink-0 transition-colors flex items-center gap-1 ${
                  statusFilter === opt
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {STATUS_LABELS[opt]}
                <span className={`text-[10px] ${statusFilter === opt ? 'opacity-80' : 'opacity-60'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Sort bar — hidden in archived view */}
      {!showArchived && (
        <div className="px-4 pt-0 pb-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">Sort:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            aria-label="Sort leads"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {SORT_LABELS[opt]}
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-md border overflow-hidden">
            <button
              onClick={() => setSortDirection('asc')}
              className={`h-8 w-8 grid place-items-center transition-colors ${
                sortDirection === 'asc' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
              title="Ascending"
              aria-label="Sort ascending"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSortDirection('desc')}
              className={`h-8 w-8 grid place-items-center transition-colors border-l ${
                sortDirection === 'desc' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
              title="Descending"
              aria-label="Sort descending"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {isAdmin && customers.length > 0 && !showArchived && (
        <div className="px-4 pb-1 flex items-center justify-between">
          {selectMode ? (
            <button onClick={exitSelect} className="text-xs text-muted-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Cancel
            </button>
          ) : (
            <button onClick={() => setSelectMode(true)} className="text-xs text-primary">
              Select to reassign
            </button>
          )}
          {selectMode && selected.size > 0 && (
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          )}
        </div>
      )}

      {/* Empty states */}
      {sorted.length === 0 && !showArchived && (
        <div className="text-center py-12 text-muted-foreground px-4">
          <p className="text-3xl mb-2">👤</p>
          <p className="text-sm font-medium">
            No {statusFilter !== 'all' ? STATUS_LABELS[statusFilter].toLowerCase() + ' ' : ''}customers
          </p>
        </div>
      )}

      {sorted.length === 0 && showArchived && (
        <div className="text-center py-12 text-muted-foreground px-4">
          <p className="text-3xl mb-2">🗄️</p>
          <p className="text-sm">No archived customers</p>
        </div>
      )}

      {sorted.length > 0 && (
        <>
          {/* ── Mobile card view ─────────────────────────────────────── */}
          <motion.div
            className={`lg:hidden ${selectMode ? 'px-4 py-2 space-y-2' : 'divide-y divide-border bg-card border rounded-xl mx-3 my-2 overflow-hidden'}`}
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {sorted.map(customer => {
              const initials = customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

              if (selectMode) {
                const isChecked = selected.has(customer.id)
                return (
                  <motion.div key={customer.id} onClick={() => toggle(customer.id)}
                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } } }}
                  >
                    <Card className={`transition-colors cursor-pointer ${isChecked ? 'border-primary bg-primary/5' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {isChecked
                              ? <CheckSquare className="h-5 w-5 text-primary" />
                              : <Square className="h-5 w-5 text-muted-foreground" />
                            }
                          </div>
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(customer.primary_phone)}</p>
                          </div>
                          {customer.tags && customer.tags.length > 0 && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">{customer.tags[0]}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              }

              const ageBadge = leadAgeBadge(customer.created_at)
              const contactBadge = lastContactBadge(lastActivityMap[customer.id] ?? null)

              const urgencyBg = activityUrgencyBg(lastActivityMap[customer.id])
              const isArchived = (customer as any).archived
              const stateConfig = isArchived
                ? { label: 'Archived', color: 'bg-muted text-muted-foreground' }
                : LEAD_STATE_CONFIG[(customer.thread_state ?? 'new_lead') as LeadState]

              return (
                <motion.div
                  key={customer.id}
                  className="relative flex items-center hover:bg-accent/40 transition-colors select-none"
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } } }}
                  onPointerDown={() => startLongPress(customer.id)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {/* Activity urgency strip */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${urgencyBg}`} />
                  <Link href={`/customers/${customer.id}`} className="flex items-center gap-3 pl-5 pr-2 py-2.5 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium truncate text-sm">{customer.name}</p>
                        {customer.lead_rating === 'hot' && (
                          <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span>{formatPhone(customer.primary_phone)}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${stateConfig?.color ?? 'bg-gray-100 text-gray-500'}`}
                          title={isArchived && (customer as any).archived_reason ? (customer as any).archived_reason : undefined}>
                          {stateConfig?.label ?? customer.thread_state}
                        </span>
                        {isArchived && (customer as any).archived_reason && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">· {(customer as any).archived_reason}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0" suppressHydrationWarning>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ageBadge.cls}`}>{ageBadge.label}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${contactBadge.cls}`}>{contactBadge.label}</span>
                    </div>
                  </Link>
                  <button
                    onPointerDown={e => { e.stopPropagation(); cancelLongPress() }}
                    onClick={e => { e.stopPropagation(); setUploadCustomerId(customer.id) }}
                    className="text-muted-foreground hover:text-primary p-2 flex-shrink-0"
                    title="Attach document"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  {!showArchived && (
                    archiveConfirm === customer.id ? (
                      <div className="flex items-center gap-1 pr-2 flex-shrink-0">
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={archiveReason}
                          onChange={e => setArchiveReason(e.target.value)}
                          className="text-xs border rounded px-2 py-1 w-28 bg-background"
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={e => { e.stopPropagation(); handleArchive(customer.id) }} className="text-xs text-destructive font-medium px-1.5">Archive</button>
                        <button onClick={e => { e.stopPropagation(); setArchiveConfirm(null); setArchiveReason('') }} className="text-muted-foreground p-1" title="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onPointerDown={e => { e.stopPropagation(); cancelLongPress() }}
                        onClick={e => { e.stopPropagation(); setArchiveConfirm(customer.id) }}
                        className="text-muted-foreground hover:text-foreground p-2 pr-3 flex-shrink-0"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </motion.div>
              )
            })}
          </motion.div>

          <CustomerQuickUploadSheet
            customerId={uploadCustomerId ?? ''}
            customerName={customers.find(c => c.id === uploadCustomerId)?.name ?? ''}
            open={uploadCustomerId !== null}
            onClose={() => setUploadCustomerId(null)}
          />

          {/* Long-press stage picker */}
          <Sheet open={!!stagePickerCustomer} onOpenChange={o => { if (!o) setStagePickerCustomer(null) }}>
            <SheetContent side="bottom" className="rounded-t-2xl h-auto pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-base">
                  Move to stage — {customers.find(c => c.id === stagePickerCustomer)?.name}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-1">
                {LEAD_STATES.map(s => {
                  const cfg = LEAD_STATE_CONFIG[s]
                  const isCurrent = (customers.find(c => c.id === stagePickerCustomer)?.thread_state ?? 'new_lead') === s
                  return (
                    <button
                      key={s}
                      disabled={savingStage}
                      onClick={() => handleStageChange(s)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                        isCurrent ? 'bg-muted font-semibold' : 'hover:bg-accent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color.split(' ')[0]}`} />
                        <span className="text-sm">{cfg.label}</span>
                      </div>
                      {isCurrent && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* ── Desktop table view ───────────────────────────────────── */}
          <div className="hidden lg:block px-6 pb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-muted-foreground font-medium">
                  {isAdmin && !showArchived && <th className="w-8 py-2 text-left" />}
                  <th className="py-2 text-left">
                    <button
                      onClick={() => handleHeaderSort('name')}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sort === 'name' ? 'text-foreground' : ''
                      }`}
                    >
                      Name
                    </button>
                  </th>
                  <th className="py-2 text-left">Phone</th>
                  <th className="py-2 text-left">Source</th>
                  <th className="py-2 text-left">State</th>
                  <th className="py-2 text-left">Assigned</th>
                  <th className="py-2 text-left">
                    <button
                      onClick={() => handleHeaderSort('last_active')}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sort === 'last_activity' ? 'text-foreground' : ''
                      }`}
                    >
                      Last Active
                    </button>
                  </th>
                  <th className="py-2 text-left">
                    <button
                      onClick={() => handleHeaderSort('response_time')}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sort === 'response_time' ? 'text-foreground' : ''
                      }`}
                    >
                      Resp. Time
                    </button>
                  </th>
                  <th className="w-8 py-2" />
                  {!showArchived && <th className="w-8 py-2" />}
                </tr>
              </thead>
              <tbody>
                {sorted.map(customer => {
                  const initials = customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  const state = customer.thread_state ?? 'new_lead'
                  const stateConfig = LEAD_STATE_CONFIG[state as keyof typeof LEAD_STATE_CONFIG]
                  const resp = fmtRespTime(customer.response_time_seconds)
                  const isChecked = selected.has(customer.id)

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => selectMode ? toggle(customer.id) : router.push(`/customers/${customer.id}`)}
                      className={`border-b transition-colors cursor-pointer ${isChecked ? 'bg-primary/5' : 'hover:bg-accent/40'}`}
                    >
                      {isAdmin && !showArchived && (
                        <td className="py-2.5 pr-2" onClick={e => { e.stopPropagation(); if (selectMode) toggle(customer.id) }}>
                          {selectMode
                            ? (isChecked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />)
                            : null
                          }
                        </td>
                      )}
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                            {initials}
                          </div>
                          <span className="font-medium truncate max-w-[160px]">{customer.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">{formatPhone(customer.primary_phone)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{SOURCE_LABELS[customer.lead_source ?? ''] ?? customer.lead_source ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stateConfig?.color ?? 'bg-muted text-muted-foreground'}`}>
                          {stateConfig?.label ?? state}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[120px]">
                        {customer.assigned_to ? (agentMap[customer.assigned_to] ?? '—') : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground tabular-nums" suppressHydrationWarning>
                        {timeAgo(lastActivityMap[customer.id])}
                      </td>
                      <td className={`py-2.5 pr-4 tabular-nums font-medium ${resp.cls}`}>{resp.text}</td>
                      <td className="py-2.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setUploadCustomerId(customer.id)}
                          className="text-muted-foreground hover:text-primary p-1"
                          title="Attach document"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      {!showArchived && (
                        <td className="py-2.5" onClick={e => e.stopPropagation()}>
                          {archiveConfirm === customer.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Reason"
                                value={archiveReason}
                                onChange={e => setArchiveReason(e.target.value)}
                                className="text-xs border rounded px-2 py-1 w-24 bg-background"
                              />
                              <button onClick={() => handleArchive(customer.id)} className="text-xs text-destructive font-medium px-1.5">OK</button>
                              <button onClick={() => { setArchiveConfirm(null); setArchiveReason('') }} className="text-muted-foreground p-1" title="Cancel">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setArchiveConfirm(customer.id)} className="text-muted-foreground hover:text-foreground p-1" title="Archive">
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Floating assignment bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-4 left-0 right-0 px-4 lg:px-6 z-50">
          <div className="bg-card border rounded-xl shadow-lg p-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <select
              className="flex-1 text-sm bg-transparent outline-none"
              value={assignTo}
              onChange={e => setAssignTo(e.target.value)}
            >
              <option value="">Unassign</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleAssign} disabled={isPending}>
              {isPending ? 'Saving…' : `Assign ${selected.size}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
