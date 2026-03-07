'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Phone, Mic, Users, Loader2, RefreshCw, Eye, ExternalLink, AlertOctagon, Pencil } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StripeInvoice {
  id: string
  date: string
  amount: number
  status: string
  pdf: string | null
}

interface ActivityEvent {
  type: string
  label: string
  timestamp: string
}

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
    stripe_customer_id: string | null
    suspended_at: string | null
    suspension_reason: string | null
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
  stripe_invoices: StripeInvoice[]
}

interface ActivityFeed {
  events: ActivityEvent[]
  feature_heatmap: Record<string, boolean>
}

interface ShadowLineItem {
  label: string
  units: number
  rate: number
  amount: number
}

interface ShadowBilling {
  org_id: string
  line_items: ShadowLineItem[]
  total: number
}

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-red-100 text-red-700',
  canceled:  'bg-gray-100 text-gray-500',
  trial:     'bg-blue-100 text-blue-700',
}

const FEATURES     = ['Email Sync', 'Voice', 'Pipeline', 'BHPH', 'Analytics', 'Fax', 'Contacts']
const FEATURE_KEYS = ['email_sync', 'voice', 'pipeline', 'bhph', 'analytics', 'fax', 'contacts']

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

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtPhone(p: string | null) {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export default function AdminOrgDetailPage() {
  const { id: orgId } = useParams<{ id: string }>()
  const router = useRouter()

  const [data, setData]             = useState<OrgDetail | null>(null)
  const [activity, setActivity]     = useState<ActivityFeed | null>(null)
  const [shadowBilling, setShadow]  = useState<ShadowBilling | null>(null)
  const [showShadow, setShowShadow] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState(false)

  const [planVal, setPlanVal]       = useState('')
  const [statusVal, setStatusVal]   = useState('')
  const [smsPlan, setSmsPlan]       = useState('')
  const [trialEndDate, setTrialEndDate] = useState('')
  const [creditAmt, setCreditAmt]   = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendForm, setShowSuspendForm] = useState(false)

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

    fetch(`/api/admin/orgs/${orgId}/activity`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setActivity(d))

    fetch(`/api/admin/orgs/${orgId}/shadow-billing`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setShadow(d))
  }, [orgId])

  async function startImpersonation(writeMode = false) {
    setImpersonating(true)
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, write_mode: writeMode }),
    })
    if (res.ok) {
      router.push('/today')
    } else {
      setImpersonating(false)
      setError('Failed to start session')
    }
  }

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

  const { org, settings, team, stats, stripe_invoices } = data
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
          {org.suspended_at && (
            <p className="text-[10px] text-orange-600 font-medium">SUSPENDED</p>
          )}
        </div>
        <Badge label={org.subscription_status ?? org.plan} />
      </div>

      <div className="px-4 py-4 space-y-5">

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

        {/* Feature heatmap */}
        {activity?.feature_heatmap && (
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Features Used (30d)</p>
            <div className="flex flex-wrap gap-1.5">
              {FEATURES.map((f, i) => {
                const active = activity.feature_heatmap[FEATURE_KEYS[i]]
                return (
                  <span key={f} className={`text-[10px] px-2 py-1 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {f}
                  </span>
                )
              })}
            </div>
          </section>
        )}

        {/* Overview */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overview</p>
          <div className="rounded-xl border bg-card divide-y text-sm">
            <Row label="Plan"        value={<Badge label={org.plan} />} />
            <Row label="SMS plan"    value={org.sms_plan} />
            <Row label="Overage"     value={org.sms_overage_enabled ? 'Enabled' : 'Blocked'} />
            <Row label="Cycle start" value={fmtDate(org.billing_cycle_start)} />
            <Row label="Cycle end"   value={fmtDate(org.billing_cycle_end)} />
            <Row label="Created"     value={fmtDate(org.created_at)} />
            <Row label="Timezone"    value={settings?.timezone ?? '—'} />
            {org.suspended_at && (
              <Row label="Suspended" value={<span className="text-orange-600">{fmtDate(org.suspended_at)}</span>} />
            )}
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
            {org.stripe_customer_id && (
              <Row
                label="Stripe"
                value={
                  <a
                    href={`https://dashboard.stripe.com/customers/${org.stripe_customer_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    View in Stripe <ExternalLink className="h-3 w-3" />
                  </a>
                }
              />
            )}
          </div>
        </section>

        {/* Recent activity */}
        {activity?.events && activity.events.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Activity</p>
            <div className="rounded-xl border bg-card divide-y text-sm">
              {activity.events.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 gap-3">
                  <span className="text-xs">{e.label}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(e.timestamp)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stripe invoice history */}
        {stripe_invoices?.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoices</p>
            <div className="rounded-xl border bg-card divide-y">
              {stripe_invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                  <div>
                    <p className="text-xs font-medium">{fmtCurrency(inv.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(inv.date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge label={inv.status} style={inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} />
                    {inv.pdf && (
                      <a href={inv.pdf} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Remote support */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remote Support</p>
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Start a session to assist this dealer. Read-only mode lets you browse without risk.
              Remote Admin mode lets you make changes on their behalf — all actions are audited.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm" variant="outline" className="h-9 text-xs gap-1.5"
                onClick={() => startImpersonation(false)}
                disabled={impersonating}
              >
                {impersonating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eye className="h-3.5 w-3.5" />}
                View as Org
              </Button>
              <Button
                size="sm"
                className="h-9 text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  if (!confirm(`Start Remote Admin session for ${org.name}?\n\nYou will be able to make changes on their behalf. All actions are logged to the audit trail.`)) return
                  startImpersonation(true)
                }}
                disabled={impersonating}
              >
                {impersonating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Pencil className="h-3.5 w-3.5" />}
                Remote Admin
              </Button>
            </div>
          </div>
        </section>

        {/* Shadow billing ledger */}
        {shadowBilling && (
          <section className="space-y-2">
            <button
              className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide"
              onClick={() => setShowShadow(v => !v)}
            >
              <span>Shadow Billing (list-rate exposure)</span>
              <span className={`font-bold ${shadowBilling.total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {fmtCurrency(shadowBilling.total)} {showShadow ? '▲' : '▼'}
              </span>
            </button>
            {showShadow && (
              <div className="rounded-xl border bg-card divide-y text-sm">
                {shadowBilling.line_items.map(item => (
                  <div key={item.label} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div>
                      <p className="text-xs">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.units} units × ${item.rate.toFixed(2)}</p>
                    </div>
                    <span className={`text-xs font-medium ${item.amount > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                      {fmtCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 gap-3 font-semibold">
                  <span className="text-xs">Total list-rate exposure</span>
                  <span className={`text-sm ${shadowBilling.total > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                    {fmtCurrency(shadowBilling.total)}
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

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
              <p className="text-[10px] text-muted-foreground">Allow messages beyond quota at $0.08/msg</p>
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
          <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-orange-800 dark:text-orange-300">Manual Override Actions</p>
              <p className="text-[10px] text-orange-700/70 dark:text-orange-400/70 mt-0.5">Use only when Stripe sync fails or customer support requires it</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm" variant="outline" className="h-8 text-xs border-orange-300"
                onClick={() => {
                  if (!confirm('Reset the billing cycle?\n\nThis zeroes SMS + voice counts and sets cycle start to today.\n\nUse only if Stripe billing cycle is out of sync.')) return
                  doAction('reset_billing', {}, 'Billing cycle reset')
                }}
                disabled={!!saving}
                title="Zeroes usage counts and restarts billing cycle from today. Use if Stripe sync is misaligned."
              >
                {saving === 'reset_billing'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />Billing Cycle</>}
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 text-xs border-orange-300"
                onClick={() => {
                  if (!confirm('Reset SMS count to 0?\n\nOnly use this if the count is wrong due to a system error.')) return
                  doAction('reset_sms_count', {}, 'SMS count reset')
                }}
                disabled={!!saving}
                title="Manually zeroes the SMS usage counter. Use only if count is incorrect."
              >
                {saving === 'reset_sms_count'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />SMS Count</>}
              </Button>
            </div>
          </div>

          {/* Stripe billing actions */}
          {org.stripe_customer_id && (
            <div className="rounded-xl border bg-card p-3 space-y-3">
              <p className="text-xs font-medium">Stripe Billing</p>

              {/* Trial end override */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">Override trial end date</p>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="h-8 text-xs flex-1"
                    value={trialEndDate}
                    onChange={e => setTrialEndDate(e.target.value)}
                  />
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                    onClick={() => doAction('set_trial_end', { trial_end: trialEndDate }, 'Trial end updated')}
                    disabled={!!saving || !trialEndDate}
                  >
                    {saving === 'set_trial_end' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
                  </Button>
                </div>
              </div>

              {/* Manual credit */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">Add credit (reduces next invoice)</p>
                <div className="flex gap-2">
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="Amount $"
                    className="h-8 text-xs flex-1"
                    value={creditAmt}
                    onChange={e => setCreditAmt(e.target.value)}
                  />
                  <Input
                    placeholder="Reason"
                    className="h-8 text-xs flex-1"
                    value={creditDesc}
                    onChange={e => setCreditDesc(e.target.value)}
                  />
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                    onClick={() => doAction('add_credit', { credit_amount: parseFloat(creditAmt), credit_description: creditDesc }, `Credit $${creditAmt} added`)}
                    disabled={!!saving || !creditAmt || parseFloat(creditAmt) <= 0}
                  >
                    {saving === 'add_credit' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Credit'}
                  </Button>
                </div>
              </div>

              {/* Cancel options */}
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="h-8 text-xs flex-1"
                  onClick={() => {
                    if (!confirm('Cancel at end of current period?')) return
                    doAction('cancel_subscription', { cancel_at_period_end: true }, 'Set to cancel at period end')
                  }}
                  disabled={!!saving}
                >
                  Cancel at Period End
                </Button>
                <Button
                  size="sm" variant="destructive" className="h-8 text-xs flex-1"
                  onClick={() => {
                    if (!confirm('Cancel immediately? This ends access now.')) return
                    doAction('cancel_subscription', { cancel_at_period_end: false }, 'Subscription cancelled immediately')
                  }}
                  disabled={!!saving}
                >
                  Cancel Now
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Danger Zone</p>
          <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-orange-600 shrink-0" />
              <p className="text-xs font-medium text-orange-800 dark:text-orange-300">Account Suspension</p>
            </div>
            {org.suspended_at ? (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">
                  Suspended {fmtDate(org.suspended_at)}{org.suspension_reason ? ` — ${org.suspension_reason}` : ''}
                </p>
                <Button
                  size="sm" className="h-8 text-xs w-full"
                  onClick={() => doAction('unsuspend', {}, 'Account unsuspended')}
                  disabled={!!saving}
                >
                  {saving === 'unsuspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Unsuspend Account'}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {showSuspendForm ? (
                  <>
                    <Input
                      placeholder="Reason for suspension (optional)"
                      className="h-8 text-xs"
                      value={suspendReason}
                      onChange={e => setSuspendReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="destructive" className="h-8 text-xs flex-1"
                        onClick={() => {
                          if (!confirm(`Suspend ${org.name}? All users will be locked out immediately.`)) return
                          doAction('suspend', { suspension_reason: suspendReason }, 'Account suspended')
                          setShowSuspendForm(false)
                        }}
                        disabled={!!saving}
                      >
                        {saving === 'suspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Suspend'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowSuspendForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    className="h-8 text-xs w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                    onClick={() => setShowSuspendForm(true)}
                  >
                    Suspend Account
                  </Button>
                )}
              </div>
            )}
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

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  )
}
