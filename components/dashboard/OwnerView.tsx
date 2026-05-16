'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, Car, CreditCard, Users } from 'lucide-react'
import type { DashboardStats } from '@/lib/dashboard/computeStats'

interface Props {
  stats: DashboardStats
}

function HealthRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 75 ? '#3D9926' : score >= 50 ? '#F5A623' : '#FF5436'

  return (
    <div className="relative flex items-center justify-center w-[120px] h-[120px] flex-shrink-0">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-foreground leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>{score}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Health</span>
      </div>
    </div>
  )
}

function BandBar({ bands, colors, labels }: {
  bands: number[]
  colors: string[]
  labels: string[]
}) {
  const total = bands.reduce((a, b) => a + b, 0)
  if (total === 0) return <p className="text-xs text-muted-foreground">No data</p>
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {bands.map((n, i) =>
          n > 0 ? (
            <div key={i} className="rounded-full transition-all" style={{ width: `${(n / total) * 100}%`, backgroundColor: colors[i] }} />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {bands.map((n, i) =>
          n > 0 ? (
            <span key={i} className="text-[10px]" style={{ color: colors[i] }}>
              {n} {labels[i]}
            </span>
          ) : null
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold" style={{ color: color ?? 'inherit' }}>
        {value}{sub && <span className="text-[10px] text-muted-foreground ml-1">{sub}</span>}
      </span>
    </div>
  )
}

function formatMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

function formatTime(s: number | null) {
  if (s === null) return '--'
  const m = Math.floor(s / 60)
  return m === 0 ? `${s}s` : `${m}m`
}

export default function OwnerView({ stats }: Props) {
  const { today, leads, inventory, bhph, gamification } = stats

  const responseColor = leads.avg_response_seconds === null ? undefined
    : leads.avg_response_seconds < 300 ? '#3D9926'
    : leads.avg_response_seconds < 600 ? '#F5A623'
    : '#FF5436'

  const healthScore = gamification.dealer_score
  const healthLabel = healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Needs attention' : 'At risk'
  const healthColor = healthScore >= 75 ? '#3D9926' : healthScore >= 50 ? '#F5A623' : '#FF5436'

  return (
    <div className="hidden lg:block px-6 pt-2 pb-6">
      {/* Section label */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        Owner Overview
      </p>

      <div className="grid grid-cols-4 gap-4">

        {/* ── Card 1: Dealer Health ──────────────────────────────── */}
        <Link href="/analytics" className="col-span-1 rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center gap-3 hover:bg-accent transition-colors block">
          <HealthRing score={healthScore} />
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: healthColor }}>{healthLabel}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Response · Tasks · Activity</p>
          </div>
          {gamification.response_streak_days > 0 && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-500 font-semibold">{gamification.response_streak_days}d</span> response streak
              </p>
            </div>
          )}
        </Link>

        {/* ── Card 2: Leads & Response ───────────────────────────── */}
        <Link href="/customers" className="col-span-1 rounded-xl border border-border bg-card p-5 hover:bg-accent transition-colors block">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-orange-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Leads</p>
          </div>
          <p className="text-3xl font-black text-foreground leading-none mb-1" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            {leads.open_leads}
          </p>
          <p className="text-xs text-muted-foreground mb-4">open leads</p>
          <StatRow label="Responded today" value={leads.responded_today} color={leads.responded_today > 0 ? '#3D9926' : undefined} />
          <StatRow label="Avg response" value={formatTime(leads.avg_response_seconds)} color={responseColor} />
          {today.urgent_leads > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-orange-500">
              <AlertTriangle className="h-3 w-3" />
              {today.urgent_leads} waiting now
            </div>
          )}
        </Link>

        {/* ── Card 3: Inventory ─────────────────────────────────── */}
        <Link href="/vehicles" className="col-span-1 rounded-xl border border-border bg-card p-5 hover:bg-accent transition-colors block">
          <div className="flex items-center gap-2 mb-3">
            <Car className="h-4 w-4 text-orange-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Inventory</p>
          </div>
          <p className="text-3xl font-black text-foreground leading-none mb-1" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            {inventory.available_count}
          </p>
          <p className="text-xs text-muted-foreground mb-4">available · {inventory.avg_days ?? '--'}d avg</p>

          {/* Aging bands */}
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Age</p>
          <BandBar
            bands={[inventory.days_0_30, inventory.days_31_60, inventory.days_61_90, inventory.days_90_plus]}
            colors={['#3D9926', '#F5A623', '#F07018', '#FF5436']}
            labels={['0–30d', '31–60d', '61–90d', '90+d']}
          />

          {/* Pricing bands */}
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 mt-3">Pricing</p>
          <BandBar
            bands={[inventory.overpriced, inventory.at_market, inventory.underpriced]}
            colors={['#FF5436', '#3D9926', '#1B4A8A']}
            labels={['overpriced', 'at market', 'below']}
          />
        </Link>

        {/* ── Card 4: BHPH Portfolio ────────────────────────────── */}
        <Link href="/bhph" className="col-span-1 rounded-xl border border-border bg-card p-5 hover:bg-accent transition-colors block">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-orange-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">BHPH</p>
          </div>
          <p className="text-3xl font-black text-foreground leading-none mb-1" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            {bhph.active_loans}
          </p>
          <p className="text-xs text-muted-foreground mb-4">active loans</p>

          {/* Delinquency bands */}
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Portfolio health</p>
          <BandBar
            bands={[bhph.current, bhph.late_30, bhph.late_60, bhph.late_90_plus]}
            colors={['#3D9926', '#F5A623', '#F07018', '#FF5436']}
            labels={['current', '1–30d late', '31–60d late', '60+d late']}
          />

          {bhph.overdue > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {formatMoney(bhph.overdue_amount)} past due
            </div>
          )}
          {bhph.due_this_week > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-500">
              <Clock className="h-3 w-3" />
              {bhph.due_this_week} due this week
            </div>
          )}
        </Link>

      </div>

      {/* ── Revenue / wins strip ───────────────────────────────────── */}
      {(gamification.wins_this_week > 0 || today.tasks_overdue > 0) && (
        <div className="mt-4 flex gap-3">
          {gamification.wins_this_week > 0 && (
            <Link href="/reports" className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/15 transition-colors">
              <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-foreground">{gamification.wins_this_week} deal{gamification.wins_this_week !== 1 ? 's' : ''} this week</span>
              {gamification.revenue_this_week > 0 && (
                <span className="text-xs text-muted-foreground">· {formatMoney(gamification.revenue_this_week)}</span>
              )}
            </Link>
          )}
          {today.tasks_overdue > 0 && (
            <Link href="/today" className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-colors">
              <TrendingDown className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-400">{today.tasks_overdue} overdue task{today.tasks_overdue !== 1 ? 's' : ''}</span>
            </Link>
          )}
          {today.tasks_overdue === 0 && gamification.wins_this_week > 0 && (
            <Link href="/today" className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/15 transition-colors">
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-sm text-green-500">No overdue tasks</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
