'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Sparkles, Flame, Trophy, ChevronRight } from 'lucide-react'
import DealerScoreTile from '@/components/dashboard/DealerScoreTile'
import StatTile from '@/components/dashboard/StatTile'
import QuickActionGrid from '@/components/dashboard/QuickActionGrid'
import OwnerView from '@/components/dashboard/OwnerView'
import type { DashboardStats } from '@/lib/dashboard/computeStats'
import UpcomingAppointmentsList from '@/components/appointments/UpcomingAppointmentsList'

const DealerBriefClient = dynamic(() => import('@/components/today/DealerBriefClient'), { ssr: false })

interface Props {
  stats: DashboardStats
  isOwner?: boolean
}

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return '--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}:${String(s).padStart(2, '0')}`
}

function responseTimeColor(seconds: number | null): 'green' | 'amber' | 'red' | 'default' {
  if (seconds === null) return 'default'
  if (seconds < 300) return 'green'
  if (seconds < 600) return 'amber'
  return 'red'
}

function greeting(orgName: string): string {
  const hour = new Date().getHours()
  const g = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return orgName ? `${g}, ${orgName}` : g
}

function todayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

export default function DashboardClient({ stats, isOwner }: Props) {
  const [briefOpen, setBriefOpen] = useState(false)
  const { today, leads, inventory, bhph, gamification, org_name, upcoming_appointments } = stats
  const totalUrgent = today.urgent_leads + today.appt_requests

  return (
    <div className="pb-28 space-y-5">
      {/* Greeting */}
      <div className="px-4 pt-4">
        <p suppressHydrationWarning className="text-base font-semibold text-foreground">{greeting(org_name)}</p>
        <p suppressHydrationWarning className="text-xs text-muted-foreground mt-0.5">{todayDate()}</p>
      </div>

      {/* ── Owner view — desktop only, admin/dealer_admin roles ─── */}
      {isOwner && <OwnerView stats={stats} />}

      {/* ── LAYER 1: Reptilian — Score + Urgency ─────────────────── */}
      <DealerScoreTile
        score={gamification.dealer_score}
        urgentLeads={today.urgent_leads}
        tasksOverdue={today.tasks_overdue}
        respondedToday={leads.responded_today}
        openLeads={leads.open_leads}
      />

      {/* Today urgency strip */}
      <Link href="/today">
        <div className="mx-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/15 transition-colors">
          <div className="flex items-center gap-3">
            {totalUrgent > 0 && (
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
              {today.urgent_leads > 0 && (
                <span className="text-orange-500 font-semibold">{today.urgent_leads} lead{today.urgent_leads !== 1 ? 's' : ''}</span>
              )}
              {today.appt_requests > 0 && (
                <span className="text-amber-500 font-semibold">{today.appt_requests} appt{today.appt_requests !== 1 ? 's' : ''}</span>
              )}
              {today.tasks_due_today > 0 && (
                <span className="text-muted-foreground">{today.tasks_due_today} task{today.tasks_due_today !== 1 ? 's' : ''} due</span>
              )}
              {totalUrgent === 0 && today.tasks_due_today === 0 && (
                <span className="text-green-600">All caught up</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Open queue <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </Link>

      {/* ── LAYER 2: Limbic — Streak + Goals + Wins ──────────────── */}
      <div className="px-4 space-y-3">
        {/* Streak + Win counter row */}
        <div className="flex gap-3">
          {gamification.response_streak_days > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex-1">
              <Flame className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-black text-amber-500 leading-none">{gamification.response_streak_days}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">day streak</p>
              </div>
            </div>
          )}
          {gamification.wins_this_week > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 flex-1">
              <Trophy className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-lg font-black text-green-600 leading-none">{gamification.wins_this_week}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {gamification.wins_this_week === 1 ? 'deal' : 'deals'} this week
                  {gamification.revenue_this_week > 0 ? ` · ${formatRevenue(gamification.revenue_this_week)}` : ''}
                </p>
              </div>
            </div>
          )}
          {gamification.response_streak_days === 0 && gamification.wins_this_week === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border flex-1">
              <Flame className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">Start your streak — respond to every lead today</p>
            </div>
          )}
        </div>

        {/* Goal progress bars */}
        {gamification.goals_today.length > 0 && (
          <div className="space-y-2">
            {gamification.goals_today.map((g) => {
              const pct = g.target > 0 ? Math.min(g.actual / g.target, 1) : 0
              const done = pct >= 1
              return (
                <div key={g.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{g.label}</span>
                    <span className={`text-xs font-semibold ${done ? 'text-green-600' : 'text-foreground'}`}>
                      {g.actual}/{g.target}
                      {done ? ' ✓' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-green-500' : pct > 0.5 ? 'bg-amber-500' : 'bg-[#F07018]'}`}
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── LAYER 3: Neocortex — Smart tiles ─────────────────────── */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {/* Leads tile */}
        <StatTile
          href="/customers"
          title="Leads"
          primary={leads.open_leads}
          primarySub="open"
          stats={[
            {
              label: 'Responded today',
              value: leads.responded_today,
              color: leads.responded_today > 0 ? 'green' : 'default',
            },
            {
              label: 'Avg response',
              value: formatResponseTime(leads.avg_response_seconds),
              color: responseTimeColor(leads.avg_response_seconds),
            },
          ]}
          alert={today.urgent_leads > 0 ? `${today.urgent_leads} waiting` : undefined}
        />

        {/* BHPH tile */}
        <StatTile
          href="/bhph"
          title="BHPH"
          primary={bhph.active_loans}
          primarySub="loans"
          stats={[
            { label: 'Due this week', value: bhph.due_this_week, color: bhph.due_this_week > 0 ? 'amber' : 'default' },
            { label: 'Overdue', value: bhph.overdue, color: bhph.overdue > 0 ? 'red' : 'green' },
          ]}
          alert={bhph.overdue > 0 ? `$${bhph.overdue_amount.toLocaleString()} past due` : undefined}
        />
      </div>

      <div className="px-4">
        <UpcomingAppointmentsList
          title="Upcoming Appointments"
          appointments={upcoming_appointments}
          compact
        />
      </div>

      {/* Inventory tile — full width */}
      <div className="px-4">
        <Link href="/vehicles">
          <div className="rounded-xl border border-border bg-card hover:bg-accent transition-colors p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Inventory</p>
            <div className="flex items-end gap-3 mb-3">
              <span className="text-3xl font-black text-foreground">{inventory.available_count}</span>
              <span className="text-xs text-muted-foreground mb-1">available</span>
              {inventory.staging_count > 0 && (
                <span className="text-xs text-amber-500 mb-1">{inventory.staging_count} staging</span>
              )}
              {inventory.avg_days !== null && (
                <span className="text-xs text-muted-foreground mb-1 ml-auto">{inventory.avg_days}d avg</span>
              )}
            </div>

            {/* Pricing health bar */}
            {(inventory.overpriced + inventory.at_market + inventory.underpriced) > 0 && (() => {
              const total = inventory.overpriced + inventory.at_market + inventory.underpriced
              return (
                <div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    {inventory.overpriced > 0 && (
                      <div className="bg-red-500/70 rounded-full" style={{ width: `${(inventory.overpriced / total) * 100}%` }} />
                    )}
                    {inventory.at_market > 0 && (
                      <div className="bg-green-500/70 rounded-full" style={{ width: `${(inventory.at_market / total) * 100}%` }} />
                    )}
                    {inventory.underpriced > 0 && (
                      <div className="bg-blue-500/70 rounded-full" style={{ width: `${(inventory.underpriced / total) * 100}%` }} />
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    {inventory.overpriced > 0 && (
                      <span className="text-[10px] text-red-400">{inventory.overpriced} overpriced</span>
                    )}
                    {inventory.at_market > 0 && (
                      <span className="text-[10px] text-green-400">{inventory.at_market} priced right</span>
                    )}
                    {inventory.underpriced > 0 && (
                      <span className="text-[10px] text-blue-400">{inventory.underpriced} below market</span>
                    )}
                    {inventory.unchecked > 0 && (
                      <span className="text-[10px] text-white/25">{inventory.unchecked} unchecked</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </Link>
      </div>

      {/* Morning Brief tile */}
      <div className="px-4">
        <button
          className="w-full rounded-xl border border-border bg-card hover:bg-accent transition-colors p-4 text-left"
          onClick={() => setBriefOpen(true)}
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Morning Brief</p>
              <p className="text-xs text-muted-foreground">Your AI dealer insight — tap to read</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </div>
        </button>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Quick Actions</p>
        <QuickActionGrid />
      </div>

      {/* Morning Brief sheet */}
      <Sheet open={briefOpen} onOpenChange={setBriefOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Morning Brief
            </SheetTitle>
          </SheetHeader>
          <div className="px-2">
            <DealerBriefClient />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
