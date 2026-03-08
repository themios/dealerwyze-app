'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Customer } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Phone, CheckSquare, Square, X, UserCheck, Archive, ArrowUpDown } from 'lucide-react'
import { formatPhone, leadAgeBadge, lastContactBadge } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { LEAD_STATE_CONFIG } from '@/lib/leads/states'

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
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const text = m > 0 ? `${m}m ${s}s` : `${s}s`
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
  showArchived?: boolean
}

type SortOption = 'name' | 'newest' | 'oldest' | 'last_active'
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
  name: 'Name',
  newest: 'Newest',
  oldest: 'Oldest',
  last_active: 'Last Active',
}

function sortCustomers(customers: Customer[], sort: SortOption, lastActivityMap: Record<string, string>): Customer[] {
  const copy = [...customers]
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'newest':
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'oldest':
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'last_active':
      return copy.sort((a, b) => {
        const la = lastActivityMap[a.id] ?? a.created_at
        const lb = lastActivityMap[b.id] ?? b.created_at
        return lb.localeCompare(la)
      })
  }
}

export default function CustomersListClient({ customers: initial, isAdmin, agents, lastActivityMap = {}, showArchived = false }: Props) {
  const [customers, setCustomers] = useState<Customer[]>(initial)
  const [sort, setSort] = useState<SortOption>('newest')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [isPending, startTransition] = useTransition()
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const router = useRouter()

  const agentMap = useMemo(
    () => Object.fromEntries(agents.map(a => [a.id, a.display_name])),
    [agents]
  )

  const sorted = sortCustomers(
    statusFilter === 'all'
      ? customers
      : customers.filter(c => (c.thread_state ?? 'new_lead') === statusFilter),
    sort,
    lastActivityMap,
  )

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
    <>
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
        <div className="px-4 pt-0 pb-1 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground flex-shrink-0">Sort:</span>
          {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
            <button
              key={opt}
              onClick={() => setSort(opt)}
              className={`text-xs px-2.5 py-1 rounded-full flex-shrink-0 transition-colors ${
                sort === opt
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {SORT_LABELS[opt]}
            </button>
          ))}
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
          <div className={`lg:hidden ${selectMode ? 'px-4 py-2 space-y-2' : 'divide-y divide-border bg-card border rounded-xl mx-3 my-2 overflow-hidden'}`}>
            {sorted.map(customer => {
              const initials = customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

              if (selectMode) {
                const isChecked = selected.has(customer.id)
                return (
                  <div key={customer.id} onClick={() => toggle(customer.id)}>
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
                  </div>
                )
              }

              const ageBadge = leadAgeBadge(customer.created_at)
              const contactBadge = lastContactBadge(lastActivityMap[customer.id] ?? null)

              return (
                <div key={customer.id} className="flex items-center hover:bg-accent/40 transition-colors">
                  <Link href={`/customers/${customer.id}`} className="flex items-center gap-3 px-4 py-2.5 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{customer.name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span>{formatPhone(customer.primary_phone)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0" suppressHydrationWarning>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ageBadge.cls}`}>{ageBadge.label}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${contactBadge.cls}`}>{contactBadge.label}</span>
                    </div>
                  </Link>
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
                      <button onClick={e => { e.stopPropagation(); setArchiveConfirm(customer.id) }} className="text-muted-foreground hover:text-foreground p-2 pr-3 flex-shrink-0" title="Archive">
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Desktop table view ───────────────────────────────────── */}
          <div className="hidden lg:block px-6 pb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-muted-foreground font-medium">
                  {isAdmin && !showArchived && <th className="w-8 py-2 text-left" />}
                  <th className="py-2 text-left">
                    <button onClick={() => setSort('name')} className={`flex items-center gap-1 hover:text-foreground transition-colors ${sort === 'name' ? 'text-foreground' : ''}`}>
                      Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-2 text-left">Phone</th>
                  <th className="py-2 text-left">Source</th>
                  <th className="py-2 text-left">State</th>
                  <th className="py-2 text-left">Assigned</th>
                  <th className="py-2 text-left">
                    <button onClick={() => setSort('last_active')} className={`flex items-center gap-1 hover:text-foreground transition-colors ${sort === 'last_active' ? 'text-foreground' : ''}`}>
                      Last Active <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-2 text-left">Resp. Time</th>
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
    </>
  )
}
