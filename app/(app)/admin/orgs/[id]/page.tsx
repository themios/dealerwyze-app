'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Phone, Mic, Users, Loader2, RefreshCw } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface OrgDetail {
  org: {
    id: string
    name: string
    plan: string
    subscription_status: string | null
    sms_plan: string
    sms_quota: number
    monthly_message_count: number
    monthly_mms_count: number
    monthly_voice_seconds: number
    billing_cycle_start: string | null
    billing_cycle_end: string | null
    sms_overage_enabled: boolean
    created_at: string
  }
  settings: {
    business_phone: string | null
    twilio_phone_number: string | null
    retell_agent_id: string | null
    timezone: string | null
  } | null
  team: { id: string; display_name: string; role: string; created_at: string }[]
  stats: { voice_calls_30d: number; voice_minutes_30d: number; leads_30d: number }
}

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-red-100 text-red-700',
  canceled:  'bg-gray-100 text-gray-500',
  trial:     'bg-blue-100 text-blue-700',
}

function Badge({ label, style }: { label: string; style?: string }) {
  const cls = style ?? STATUS_STYLES[label] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label.replace('_', ' ')}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPhone(p: string | null) {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

export default function AdminOrgDetailPage() {
  const { id: orgId } = useParams<{ id: string }>()
  const router = useRouter()

  const [data, setData]     = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Action state
  const [planVal, setPlanVal]     = useState('')
  const [statusVal, setStatusVal] = useState('')
  const [smsPlan, setSmsPlan]     = useState('')

  useEffect(() => {
    fetch(`/api/admin/orgs/${orgId}`)
      .then(r => r.json())
      .then((d: OrgDetail) => {
        setData(d)
        setPlanVal(d.org.plan)
        setStatusVal(d.org.subscription_status ?? 'trialing')
        setSmsPlan(d.org.sms_plan)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [orgId])

  async function doAction(action: string, payload: Record<string, unknown> = {}, label: string) {
    setSaving(action)
    setError(null)
    setSuccess(null)
    const res  = await fetch(`/api/admin/orgs/${orgId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, ...payload }),
    })
    const body = await res.json() as { ok?: boolean; error?: string }
    setSaving(null)
    if (!res.ok) {
      setError(body.error ?? 'Failed')
    } else {
      setSuccess(label)
      // Refresh data
      fetch(`/api/admin/orgs/${orgId}`).then(r => r.json()).then((d: OrgDetail) => setData(d))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        Organization not found.
      </div>
    )
  }

  const { org, settings, team, stats } = data
  const voiceMinsMo = Math.round((org.monthly_voice_seconds ?? 0) / 60)

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{org.name || 'Unnamed Org'}</p>
        </div>
        <Badge label={org.subscription_status ?? org.plan} />
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* Feedback banners */}
        {error   && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg">{success} ✓</p>}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'SMS this cycle', value: `${org.monthly_message_count} / ${org.sms_quota}` },
            { label: 'Voice mins (mo)', value: voiceMinsMo },
            { label: 'Leads (30d)', value: stats.leads_30d },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-bold leading-tight">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overview</p>
          <div className="rounded-xl border bg-card divide-y text-sm">
            <Row label="Plan"       value={<Badge label={org.plan} />} />
            <Row label="SMS plan"   value={org.sms_plan} />
            <Row label="Overage"    value={org.sms_overage_enabled ? 'Enabled' : 'Blocked'} />
            <Row label="Cycle start" value={fmtDate(org.billing_cycle_start)} />
            <Row label="Cycle end"   value={fmtDate(org.billing_cycle_end)} />
            <Row label="Created"     value={fmtDate(org.created_at)} />
            <Row label="Timezone"    value={settings?.timezone ?? '—'} />
          </div>
        </section>

        {/* Infrastructure */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Infrastructure</p>
          <div className="rounded-xl border bg-card divide-y text-sm">
            <Row
              label={<span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />SMS Number</span>}
              value={settings?.twilio_phone_number
                ? <span className="font-mono">{fmtPhone(settings.twilio_phone_number)}</span>
                : <span className="text-muted-foreground">Not provisioned</span>}
            />
            <Row
              label={<span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" />Voice Agent</span>}
              value={settings?.retell_agent_id
                ? <Badge label="active" style="bg-green-100 text-green-700" />
                : <span className="text-muted-foreground">Not configured</span>}
            />
          </div>
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</p>

          {/* Subscription plan */}
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-xs font-medium">Subscription Plan</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={planVal} onValueChange={setPlanVal}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['trial','active','canceled'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusVal} onValueChange={setStatusVal}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['trialing','active','past_due','canceled','unpaid'].map(v => (
                    <SelectItem key={v} value={v}>{v.replace('_',' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm" className="w-full h-8 text-xs"
              onClick={() => doAction('update_plan', { plan: planVal, subscription_status: statusVal }, 'Plan updated')}
              disabled={!!saving}
            >
              {saving === 'update_plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Plan'}
            </Button>
          </div>

          {/* SMS plan */}
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-xs font-medium">SMS Plan</p>
            <Select value={smsPlan} onValueChange={setSmsPlan}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tier1">Tier 1 — 1,000 msgs/mo</SelectItem>
                <SelectItem value="tier2">Tier 2 — 3,000 msgs/mo</SelectItem>
                <SelectItem value="tier3">Tier 3 — 10,000 msgs/mo</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm" className="w-full h-8 text-xs"
              onClick={() => doAction('update_sms_plan', { sms_plan: smsPlan }, 'SMS plan updated')}
              disabled={!!saving}
            >
              {saving === 'update_sms_plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save SMS Plan'}
            </Button>
          </div>

          {/* Overage toggle */}
          <div className="rounded-xl border bg-card p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">SMS Overage</p>
              <p className="text-[10px] text-muted-foreground">Allow messages beyond quota at $0.03/msg</p>
            </div>
            <Button
              size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => doAction('toggle_overage', { sms_overage_enabled: !org.sms_overage_enabled }, `Overage ${!org.sms_overage_enabled ? 'enabled' : 'disabled'}`)}
              disabled={!!saving}
            >
              {saving === 'toggle_overage' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (org.sms_overage_enabled ? 'Disable' : 'Enable')}
            </Button>
          </div>

          {/* Billing / count resets */}
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-xs font-medium">Reset Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => {
                  if (!confirm('Reset the billing cycle? This zeroes SMS + voice counts and sets cycle start to today.')) return
                  doAction('reset_billing', {}, 'Billing cycle reset')
                }}
                disabled={!!saving}
              >
                {saving === 'reset_billing'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />Billing Cycle</>}
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => {
                  if (!confirm('Reset SMS count to 0?')) return
                  doAction('reset_sms_count', {}, 'SMS count reset')
                }}
                disabled={!!saving}
              >
                {saving === 'reset_sms_count'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />SMS Count</>}
              </Button>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Team ({team.length})
          </p>
          {team.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users found.</p>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {team.map(u => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{u.display_name || 'Unnamed'}</p>
                    <p className="text-[10px] text-muted-foreground">Joined {fmtDate(u.created_at)}</p>
                  </div>
                  <Badge
                    label={u.role}
                    style={u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  )
}
