'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Loader2 } from 'lucide-react'

const PLAN_LABEL: Record<string, string> = {
  tier1: 'Complete CRM',
  tier2: 'Voice AI',
  tier3: 'Legacy',
}

interface Analytics {
  summary: { total: number; active: number; trialing: number; past_due: number; canceled: number }
  mrr: number
  new_orgs_30d: number
  new_orgs_7d: number
  platform_sms_30d: number
  platform_voice_minutes_30d: number
  feature_adoption: { gmail_pct: number; voice_pct: number }
  trial_conversion_rate: number
  top_orgs: Array<{
    id: string; name: string; plan: string; status: string
    sms: number; voice_seconds: number
  }>
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function AdoptionBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [data, setData]     = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then(r => r.json())
      .then((d: Analytics) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div>
      <TopBar title="Analytics" />
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  )

  if (!data) return (
    <div>
      <TopBar title="Analytics" />
      <p className="text-center text-sm text-muted-foreground py-20">Failed to load analytics.</p>
    </div>
  )

  const { summary, mrr, new_orgs_30d, new_orgs_7d, platform_sms_30d,
          platform_voice_minutes_30d, feature_adoption, trial_conversion_rate, top_orgs } = data

  return (
    <div>
      <TopBar title="Analytics" />
      <div className="px-4 py-4 space-y-6 pb-24">

        {/* MRR */}
        <div className="rounded-xl border bg-card p-5 text-center">
          <p className="text-4xl font-bold">${mrr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-sm text-muted-foreground mt-1">Estimated Monthly Recurring Revenue</p>
          <p className="text-xs text-muted-foreground mt-0.5">{summary.active} active orgs</p>
        </div>

        {/* Status breakdown */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Org Status</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Orgs"  value={summary.total} />
            <StatCard label="Active"      value={summary.active} />
            <StatCard label="Trialing"    value={summary.trialing} />
            <StatCard label="Past Due"    value={summary.past_due} />
          </div>
        </section>

        {/* Growth */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Growth</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="New this week"   value={`+${new_orgs_7d}`} />
            <StatCard label="New last 30 days" value={`+${new_orgs_30d}`} />
            <StatCard label="Trial → Paid"    value={`${trial_conversion_rate}%`} sub="of non-canceled" />
          </div>
        </section>

        {/* Platform usage */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Platform Usage (current period)</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="SMS messages"   value={platform_sms_30d.toLocaleString()} />
            <StatCard label="Voice minutes"  value={platform_voice_minutes_30d.toLocaleString()} />
          </div>
        </section>

        {/* Feature adoption */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Feature Adoption</p>
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <AdoptionBar label="Gmail / Email sync"  pct={feature_adoption.gmail_pct} />
            <AdoptionBar label="Retell Voice Agent"  pct={feature_adoption.voice_pct} />
          </div>
        </section>

        {/* Top orgs by SMS */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Orgs by SMS Usage</p>
          <div className="space-y-2">
            {top_orgs.map((org, i) => (
              <div key={org.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{org.name}</p>
                  <p className="text-[10px] text-muted-foreground">{PLAN_LABEL[org.plan] ?? org.plan} · {org.status}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{org.sms.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">msgs</p>
                </div>
              </div>
            ))}
            {top_orgs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
