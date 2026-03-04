'use client'

import Link from 'next/link'
import { PIPELINE_STATES, LEAD_STATE_CONFIG, type LeadState } from '@/lib/leads/states'
import { formatPhone } from '@/lib/utils'

interface PipelineCustomer {
  id: string
  name: string
  primary_phone: string | null
  thread_state: string | null
  lead_state_changed_at: string | null
  created_at: string
  lead_source: string | null
}

interface Props {
  customers: PipelineCustomer[]
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function PipelineCard({ customer }: { customer: PipelineCustomer }) {
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="block rounded-xl border bg-card p-3 space-y-1 active:opacity-70 hover:bg-accent transition-colors"
    >
      <p className="text-sm font-medium leading-tight truncate">{customer.name}</p>
      {customer.primary_phone && (
        <p className="text-xs text-muted-foreground">{formatPhone(customer.primary_phone)}</p>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {customer.lead_source && (
          <span className="text-[10px] text-muted-foreground truncate">{customer.lead_source}</span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0 ml-auto" suppressHydrationWarning>
          {timeAgo(customer.lead_state_changed_at ?? customer.created_at)}
        </span>
      </div>
    </Link>
  )
}

function PipelineColumn({ state, customers }: { state: LeadState; customers: PipelineCustomer[] }) {
  const cfg = LEAD_STATE_CONFIG[state]
  return (
    <div className="w-52 flex-shrink-0 flex flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground">{customers.length}</span>
      </div>
      {/* Cards */}
      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground">None</p>
        </div>
      ) : (
        customers.map(c => <PipelineCard key={c.id} customer={c} />)
      )}
    </div>
  )
}

export default function PipelineBoard({ customers }: Props) {
  // Group by state
  const byState = Object.fromEntries(
    PIPELINE_STATES.map(s => [s, customers.filter(c => (c.thread_state ?? 'new_lead') === s)])
  ) as Record<LeadState, PipelineCustomer[]>

  return (
    <div className="flex gap-3 overflow-x-auto px-4 py-3 pb-24 min-h-[calc(100dvh-120px)] items-start">
      {PIPELINE_STATES.map(state => (
        <PipelineColumn key={state} state={state} customers={byState[state] ?? []} />
      ))}
    </div>
  )
}
