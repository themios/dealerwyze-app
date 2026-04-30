'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DollarSign, Users, AlertTriangle, TrendingDown,
  RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, Clock, Wifi, WifiOff, Archive,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type DealerHealth = 'churned' | 'at_risk' | 'dormant' | 'free' | 'trialing' | 'healthy'

interface Dealer {
  id: string
  name: string
  slug: string
  subscription_status: string
  monthly_message_count: number
  created_at: string
  health: DealerHealth
  archived: boolean
}

interface CommissionEvent {
  id: string
  event_type: string
  amount: number
  status: 'pending' | 'paid'
  billing_period: string | null
  paid_at: string | null
  paid_via: string | null
  created_at: string
  org_name: string
}

interface Stats {
  pending_balance: number
  all_time_paid: number
  active_dealers: number
}

interface AffiliateInfo {
  code: string
  owner_name: string
  owner_email: string | null
  type: string
  commission_first_pct: number
  commission_recurring_pct: number
}

// ── Health config ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<DealerHealth, {
  label: string
  color: string
  bg: string
  icon: React.ElementType
  urgent: boolean
  callToAction: string
}> = {
  churned:  { label: 'Churned',    color: 'text-red-700',    bg: 'bg-red-50 border-red-200',     icon: TrendingDown,    urgent: true,  callToAction: 'Check in — they canceled' },
  at_risk:  { label: 'At Risk',    color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle,   urgent: true,  callToAction: 'Past due — offer help' },
  dormant:  { label: 'Dormant',    color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: WifiOff,         urgent: true,  callToAction: 'No usage this month — follow up' },
  free:     { label: 'Free Plan',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: Wifi,            urgent: false, callToAction: 'Upgrade opportunity' },
  trialing: { label: 'Trialing',   color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: Clock,          urgent: false, callToAction: 'Convert to paid' },
  healthy:  { label: 'Active',     color: 'text-green-700',  bg: 'bg-green-50 border-green-200', icon: CheckCircle2,    urgent: false, callToAction: '' },
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const [nowMs] = useState(() => Date.now())
  const [affiliate, setAffiliate]   = useState<AffiliateInfo | null>(null)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [dealers, setDealers]       = useState<Dealer[]>([])
  const [events, setEvents]         = useState<CommissionEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [showCommissions, setShowCommissions] = useState(false)
  const [showArchived, setShowArchived]       = useState(false)

  const load = useCallback(async (options?: { showSpinner?: boolean }) => {
    if (options?.showSpinner !== false) setLoading(true)
    const [meRes, dealersRes, commissionsRes] = await Promise.all([
      fetch('/api/sales/me'),
      fetch(`/api/sales/dealers${showArchived ? '?include_archived=true' : ''}`),
      fetch('/api/sales/commissions'),
    ])
    if (meRes.ok) {
      const d = await meRes.json()
      setAffiliate(d.affiliate)
      setStats(d.stats)
    }
    if (dealersRes.ok) {
      const d = await dealersRes.json()
      setDealers(d.dealers ?? [])
    }
    if (commissionsRes.ok) {
      const d = await commissionsRes.json()
      setEvents(d.events ?? [])
    }
    setLoading(false)
  }, [showArchived])

  async function archiveDealer(orgId: string, archived: boolean) {
    await fetch('/api/sales/dealers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, archived }),
    })
    await load()
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const [meRes, dealersRes, commissionsRes] = await Promise.all([
        fetch('/api/sales/me'),
        fetch(`/api/sales/dealers${showArchived ? '?include_archived=true' : ''}`),
        fetch('/api/sales/commissions'),
      ])
      if (cancelled) return

      if (meRes.ok) {
        const d = await meRes.json()
        if (!cancelled) {
          setAffiliate(d.affiliate)
          setStats(d.stats)
        }
      }
      if (dealersRes.ok) {
        const d = await dealersRes.json()
        if (!cancelled) setDealers(d.dealers ?? [])
      }
      if (commissionsRes.ok) {
        const d = await commissionsRes.json()
        if (!cancelled) setEvents(d.events ?? [])
      }
      if (!cancelled) setLoading(false)
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [showArchived])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!affiliate) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">No affiliate code linked to your account. Contact your admin.</p>
      </div>
    )
  }

  const urgentDealers = dealers.filter(d => HEALTH_CONFIG[d.health].urgent)
  const pendingEvents = events.filter(e => e.status === 'pending')
  const paidEvents    = events.filter(e => e.status === 'paid')

  return (
    <div className="max-w-2xl mx-auto p-4 pb-20 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D2B55' }}>Sales Dashboard</h1>
          <p className="text-sm text-gray-500">
            {affiliate.owner_name} ·{' '}
            <code className="font-mono text-blue-600">{affiliate.code}</code>
            {' '}· {affiliate.type}
          </p>
        </div>
        <button onClick={() => { void load() }} title="Refresh dashboard data" className="p-2 rounded-lg hover:bg-gray-100">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Commission rates */}
      <div className="text-xs text-gray-400 flex gap-4">
        <span>{affiliate.commission_first_pct}% first-month commission</span>
        {affiliate.commission_recurring_pct > 0 && (
          <span>{affiliate.commission_recurring_pct}% recurring</span>
        )}
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', value: `$${stats.pending_balance.toFixed(2)}`, icon: Clock, color: 'text-orange-600' },
            { label: 'All-time earned', value: `$${stats.all_time_paid.toFixed(2)}`, icon: DollarSign, color: 'text-green-600' },
            { label: 'Active dealers', value: String(stats.active_dealers), icon: Users, color: 'text-blue-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="border rounded-xl p-3 bg-white text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
              <p className="text-base font-bold">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Urgent alerts */}
      {urgentDealers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Needs attention ({urgentDealers.length})
          </h2>
          <div className="space-y-2">
            {urgentDealers.map(d => (
              <DealerCard key={d.id} dealer={d} onArchive={archiveDealer} nowMs={nowMs} />
            ))}
          </div>
        </div>
      )}

      {/* All dealers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            All dealers ({dealers.length})
          </h2>
          <button
            onClick={() => setShowArchived(s => !s)}
            title={showArchived ? 'Hide dealers you have archived' : 'Show dealers you previously archived (hidden from normal view)'}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
        <div className="space-y-2">
          {dealers.filter(d => !HEALTH_CONFIG[d.health].urgent).map(d => (
            <DealerCard key={d.id} dealer={d} onArchive={archiveDealer} nowMs={nowMs} />
          ))}
          {dealers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No dealers referred yet. Share your signup link:
              <br />
              <code className="text-xs text-blue-600 mt-1 block">
                https://dealerwyze.com/signup?ref={affiliate.code}
              </code>
            </p>
          )}
        </div>
      </div>

      {/* Commission history */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCommissions(s => !s)}
          title={showCommissions ? 'Collapse commission history' : 'Expand to see all pending and paid commission events'}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700"
        >
          <span>Commission history ({events.length})</span>
          {showCommissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showCommissions && (
          <div className="divide-y">
            {events.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No commissions yet.</p>
            )}
            {pendingEvents.length > 0 && (
              <div className="px-4 py-2 bg-orange-50">
                <p className="text-xs font-semibold text-orange-700 mb-2">Pending</p>
                {pendingEvents.map(e => <CommissionRow key={e.id} event={e} />)}
              </div>
            )}
            {paidEvents.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-xs font-semibold text-gray-500 mb-2">Paid out</p>
                {paidEvents.map(e => <CommissionRow key={e.id} event={e} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dealer card ────────────────────────────────────────────────────────────────

function DealerCard({
  dealer,
  onArchive,
  nowMs,
}: {
  dealer: Dealer
  onArchive: (orgId: string, archived: boolean) => void
  nowMs: number
}) {
  const cfg = HEALTH_CONFIG[dealer.health]
  const Icon = cfg.icon
  const daysOld = Math.floor((nowMs - new Date(dealer.created_at).getTime()) / 86400000)

  return (
    <div className={`border rounded-xl p-3 ${dealer.archived ? 'opacity-60 bg-gray-50 border-gray-200' : cfg.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{dealer.name}</p>
            <p className={`text-xs font-medium ${cfg.color}`}>
              {dealer.archived ? 'Archived' : cfg.label}
            </p>
            {!dealer.archived && cfg.callToAction && (
              <p className="text-xs text-gray-500 mt-0.5">{cfg.callToAction}</p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
          <div className="text-right text-xs text-gray-400 space-y-0.5">
            <p>{daysOld}d old</p>
            {dealer.monthly_message_count > 0 && (
              <p>{dealer.monthly_message_count} msgs/mo</p>
            )}
          </div>
          <button
            onClick={() => onArchive(dealer.id, !dealer.archived)}
            title={dealer.archived ? 'Unarchive' : 'Archive (hide from view)'}
            className="p-1 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Commission row ─────────────────────────────────────────────────────────────

function CommissionRow({ event }: { event: CommissionEvent }) {
  const typeLabel: Record<string, string> = {
    first_month: 'First month',
    free_to_paid: 'Free → Paid',
    recurring:   'Recurring',
  }
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div>
        <p className="font-medium text-gray-800">{event.org_name}</p>
        <p className="text-xs text-gray-400">
          {typeLabel[event.event_type] ?? event.event_type}
          {event.billing_period ? ` · ${event.billing_period}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-bold ${event.status === 'pending' ? 'text-orange-600' : 'text-green-600'}`}>
          ${Number(event.amount).toFixed(2)}
        </p>
        {event.paid_via && (
          <p className="text-xs text-gray-400 capitalize">{event.paid_via}</p>
        )}
      </div>
    </div>
  )
}
