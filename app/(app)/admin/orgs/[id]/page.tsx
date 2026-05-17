'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft, Phone, Mic, Users, Loader2, RefreshCw, Eye, ExternalLink,
  AlertOctagon, Pencil, MessageSquarePlus, Clock, CheckCircle2, Circle,
  Mail, Globe, MapPin, Send, ChevronDown, ChevronUp, ShieldCheck,
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── types ─────────────────────────────────────────────────────────────────────

interface StripeInvoice {
  id: string; date: string; amount: number; status: string; pdf: string | null
}
interface ActivityEvent {
  type: string; label: string; timestamp: string
}
interface OrgDetail {
  org: {
    id: string; name: string; plan: string; subscription_status: string | null
    sms_plan: string; sms_quota: number; monthly_message_count: number
    monthly_mms_count: number; monthly_voice_seconds: number
    billing_cycle_start: string | null; billing_cycle_end: string | null
    sms_overage_enabled: boolean; stripe_customer_id: string | null
    suspended_at: string | null; suspension_reason: string | null
    created_at: string; business_address: string | null
    website_contact_email: string | null
  }
  settings: {
    business_phone: string | null; business_name: string | null
    city: string | null; state: string | null; zip_code: string | null
    dealer_website_url: string | null; twilio_phone_number: string | null
    retell_agent_id: string | null; timezone: string | null
  } | null
  signup_email: string | null
  team: { id: string; display_name: string; role: string; created_at: string }[]
  stats: { voice_calls_30d: number; voice_minutes_30d: number; leads_30d: number }
  stripe_invoices: StripeInvoice[]
}
interface ActivityFeed {
  events: ActivityEvent[]; feature_heatmap: Record<string, boolean>
}
interface SystemHealth {
  last_active_at: string | null; last_active_humanized: string | null
  error_count_24h: number | null
  recovery_records: { pending_count: number; oldest_expires_at: string | null } | null
}
interface ShadowLineItem {
  label: string; units: number; rate: number; amount: number
}
interface ShadowBilling {
  org_id: string; line_items: ShadowLineItem[]; total: number
}
interface RetentionNote {
  id: string; admin_name: string; created_at: string; note: string; contact_method: string | null
}
type CommsItem =
  | { kind: 'email'; id: string; subject: string; body_text: string | null; email_type: string; type_label: string; to_email: string; ts: string }
  | { kind: 'note';  id: string; note: string; contact_method: string | null; admin_name: string; admin_user_id: string; ts: string }

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  trial:    'bg-blue-100 text-blue-700',
}
const FEATURES     = ['Email Sync', 'Voice', 'Pipeline', 'BHPH', 'Analytics', 'Fax', 'Contacts']
const FEATURE_KEYS = ['email_sync', 'voice', 'pipeline', 'bhph', 'analytics', 'fax', 'contacts']

const EMAIL_ICON: Record<string, string> = {
  welcome:            '👋',
  onboarding_nudge:   '🔔',
  dealer_followup_d1: '📧',
  dealer_followup_d3: '📧',
  dealer_followup_d7: '📧',
}

const CONTACT_METHOD_LABEL: Record<string, string> = {
  email: 'Email', phone: 'Phone call', sms: 'SMS',
  in_person: 'In person', other: 'Other',
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'comms'

export default function AdminOrgDetailPage() {
  const { id: orgId } = useParams<{ id: string }>()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [data, setData]             = useState<OrgDetail | null>(null)
  const [activity, setActivity]     = useState<ActivityFeed | null>(null)
  const [shadowBilling, setShadow]  = useState<ShadowBilling | null>(null)
  const [showShadow, setShowShadow] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState(false)
  const [systemHealth, setSystemHealth]   = useState<SystemHealth | null>(null)

  const [planVal, setPlanVal]         = useState('')
  const [statusVal, setStatusVal]     = useState('')
  const [smsPlan, setSmsPlan]         = useState('')
  const [trialEndDate, setTrialEndDate] = useState('')
  const [creditAmt, setCreditAmt]     = useState('')
  const [creditDesc, setCreditDesc]   = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendForm, setShowSuspendForm] = useState(false)

  // Notes (for posting — comms tab reads from /comms)
  const [noteText, setNoteText]     = useState('')
  const [noteMethod, setNoteMethod] = useState('email')
  const [savingNote, setSavingNote] = useState(false)

  // Communications tab
  const [comms, setComms]               = useState<CommsItem[]>([])
  const [commsLoading, setCommsLoading] = useState(false)
  const [commsFetched, setCommsFetched] = useState(false)
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  useEffect(() => {
    fetch(`/api/admin/orgs/${orgId}`)
      .then(r => r.json())
      .then((d: OrgDetail) => {
        setData(d); setPlanVal(d.org.plan)
        setStatusVal(d.org.subscription_status ?? 'trialing')
        setSmsPlan(d.org.sms_plan); setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch(`/api/admin/orgs/${orgId}/activity`)
      .then(r => r.ok ? r.json() : null).then(d => d && setActivity(d))

    fetch(`/api/admin/orgs/${orgId}/shadow-billing`)
      .then(r => r.ok ? r.json() : null).then(d => d && setShadow(d))

    fetch(`/api/admin/orgs/${orgId}/health`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SystemHealth | null) => d && setSystemHealth(d))
      .catch(() => {})
  }, [orgId])

  // Lazy-load comms when tab is first opened
  useEffect(() => {
    if (activeTab !== 'comms' || commsFetched) return
    setCommsLoading(true)
    setCommsFetched(true)
    fetch(`/api/admin/orgs/${orgId}/comms`)
      .then(r => r.ok ? r.json() : [])
      .then((d: CommsItem[]) => setComms(Array.isArray(d) ? d : []))
      .finally(() => setCommsLoading(false))
  }, [activeTab, orgId, commsFetched])

  async function startImpersonation(writeMode = false) {
    setImpersonating(true)
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, write_mode: writeMode }),
    })
    if (res.ok) router.push('/today')
    else { setImpersonating(false); setError('Failed to start session') }
  }

  async function doAction(action: string, payload: Record<string, unknown> = {}, label: string) {
    setSaving(action); setError(null); setSuccess(null)
    const res = await fetch(`/api/admin/orgs/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const body = await res.json() as { ok?: boolean; error?: string }
    setSaving(null)
    if (!res.ok) setError(body.error ?? 'Failed')
    else {
      setSuccess(label)
      fetch(`/api/admin/orgs/${orgId}`).then(r => r.json()).then((d: OrgDetail) => setData(d))
    }
  }

  async function saveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText.trim(), contact_method: noteMethod }),
    })
    if (res.ok) {
      setNoteText('')
      // Refresh comms feed
      setCommsFetched(false)
    }
    setSavingNote(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">Organization not found.</div>
  }

  const { org, settings, team, stats, stripe_invoices, signup_email } = data
  const voiceMinsMo = Math.round((org.monthly_voice_seconds ?? 0) / 60)

  return (
    <div className="pb-24">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{org.name || 'Unnamed Org'}</p>
            {org.suspended_at && <p className="text-[10px] text-orange-600 font-medium">SUSPENDED</p>}
          </div>
          <Badge label={org.subscription_status ?? org.plan} />
        </div>

        {/* Tab bar */}
        <div className="flex border-t">
          {(['overview', 'comms'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'overview' ? 'Overview' : 'Communications'}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="px-4 py-4 space-y-5">

          {error   && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
          {success && <p className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg">{success} ✓</p>}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'SMS this cycle', value: `${org.monthly_message_count} / ${org.sms_quota}` },
              { label: 'Voice mins (mo)', value: voiceMinsMo },
              { label: 'Leads (30d)',     value: stats.leads_30d },
            ].map(s => (
              <div key={s.label} className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold leading-tight">{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Contact */}
          {(() => {
            const email   = signup_email || org.website_contact_email
            const phone   = settings?.business_phone
            const website = settings?.dealer_website_url
            const address = [
              settings?.business_name !== org.name ? settings?.business_name : null,
              org.business_address,
              [settings?.city, settings?.state].filter(Boolean).join(', '),
              settings?.zip_code,
            ].filter(Boolean).join(' · ')
            if (!email && !phone && !website && !address) return null
            return (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                <div className="rounded-xl border bg-card divide-y text-sm">
                  {email   && <div className="flex items-center gap-3 px-3 py-2.5"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={`mailto:${email}`} className="text-sm text-primary hover:underline truncate">{email}</a></div>}
                  {phone   && <div className="flex items-center gap-3 px-3 py-2.5"><Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={`tel:${phone}`} className="text-sm hover:underline">{fmtPhone(phone) ?? phone}</a></div>}
                  {website && <div className="flex items-center gap-3 px-3 py-2.5"><Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{website.replace(/^https?:\/\//, '')}</a></div>}
                  {address && <div className="flex items-center gap-3 px-3 py-2.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-sm text-muted-foreground">{address}</span></div>}
                </div>
              </section>
            )
          })()}

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

          {/* System Health */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">System Health</p>
              <a href={`/admin/data-recovery?org_id=${orgId}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                Data Recovery <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="rounded-xl border bg-card divide-y text-sm">
              <Row label="Last active"           value={systemHealth?.last_active_humanized ?? '—'} />
              <Row label="Errors (24h)"          value={<span className={(systemHealth?.error_count_24h ?? 0) > 0 ? 'text-red-600 font-semibold' : ''}>{systemHealth?.error_count_24h ?? '—'}</span>} />
              <Row label="Pending recovery"      value={systemHealth?.recovery_records?.pending_count ?? '—'} />
              <Row label="Oldest expires"        value={systemHealth?.recovery_records?.oldest_expires_at ? fmtDate(systemHealth.recovery_records.oldest_expires_at) : '—'} />
            </div>
          </section>

          {/* Onboarding checklist */}
          {(() => {
            const anyFeature = activity?.feature_heatmap ? Object.values(activity.feature_heatmap).some(Boolean) : false
            const steps = [
              { label: 'SMS number provisioned',    done: !!settings?.twilio_phone_number, tip: 'Settings → Phone Number' },
              { label: 'Business phone set',         done: !!settings?.business_phone,     tip: 'Settings → Business Info' },
              { label: 'Voice agent configured',     done: !!settings?.retell_agent_id,    tip: 'Settings → AI Voice' },
              { label: 'First lead added',           done: stats.leads_30d > 0,            tip: 'Leads → Add Lead' },
              { label: 'Team member invited',        done: team.length > 1,                tip: 'Settings → Team' },
              { label: 'At least one feature used',  done: anyFeature,                     tip: 'Pipeline, BHPH, Analytics, etc.' },
            ]
            const done = steps.filter(s => s.done).length
            return (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Onboarding</p>
                  <span className={`text-xs font-medium ${done === steps.length ? 'text-green-600' : 'text-orange-600'}`}>{done}/{steps.length} complete</span>
                </div>
                <div className="rounded-xl border bg-card divide-y">
                  {steps.map(step => (
                    <div key={step.label} className="flex items-center gap-3 px-3 py-2.5">
                      {step.done ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>{step.label}</p>
                        {!step.done && <p className="text-[10px] text-muted-foreground">{step.tip}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

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
              {org.suspended_at && <Row label="Suspended" value={<span className="text-orange-600">{fmtDate(org.suspended_at)}</span>} />}
            </div>
          </section>

          {/* Infrastructure */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Infrastructure</p>
            <div className="rounded-xl border bg-card divide-y text-sm">
              <Row label={<span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />SMS Number</span>}
                   value={settings?.twilio_phone_number ? <span className="font-mono">{fmtPhone(settings.twilio_phone_number)}</span> : <span className="text-muted-foreground">Not provisioned</span>} />
              <Row label={<span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" />Voice Agent</span>}
                   value={settings?.retell_agent_id ? <Badge label="active" style="bg-green-100 text-green-700" /> : <span className="text-muted-foreground">Not configured</span>} />
              {org.stripe_customer_id && (
                <Row label="Stripe" value={
                  <a href={`https://dashboard.stripe.com/customers/${org.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    View in Stripe <ExternalLink className="h-3 w-3" />
                  </a>
                } />
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

          {/* Invoices */}
          {stripe_invoices?.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoices</p>
              <div className="rounded-xl border bg-card divide-y">
                {stripe_invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <div><p className="text-xs font-medium">{fmtCurrency(inv.amount)}</p><p className="text-[10px] text-muted-foreground">{fmtDate(inv.date)}</p></div>
                    <div className="flex items-center gap-2">
                      <Badge label={inv.status} style={inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} />
                      {inv.pdf && <a href={inv.pdf} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
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
                Start a session to assist this dealer. Read-only lets you browse without risk. Write Access lets you make changes — all actions are audited.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => startImpersonation(false)} disabled={impersonating}>
                  {impersonating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Read Only
                </Button>
                <Button size="sm" className="h-9 text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => { if (!confirm(`Start Write Access session for ${org.name}?\n\nAll actions are logged to the audit trail.`)) return; startImpersonation(true) }}
                  disabled={impersonating}
                >
                  {impersonating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Write Access
                </Button>
              </div>
            </div>
          </section>

          {/* Shadow billing */}
          {shadowBilling && (
            <section className="space-y-2">
              <button className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide" onClick={() => setShowShadow(v => !v)}>
                <span>Shadow Billing (list-rate exposure)</span>
                <span className={`font-bold ${shadowBilling.total > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmtCurrency(shadowBilling.total)} {showShadow ? '▲' : '▼'}</span>
              </button>
              {showShadow && (
                <div className="rounded-xl border bg-card divide-y text-sm">
                  {shadowBilling.line_items.map(item => (
                    <div key={item.label} className="flex items-center justify-between px-3 py-2 gap-3">
                      <div><p className="text-xs">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.units} units × ${item.rate.toFixed(2)}</p></div>
                      <span className={`text-xs font-medium ${item.amount > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>{fmtCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2.5 gap-3 font-semibold">
                    <span className="text-xs">Total</span>
                    <span className={`text-sm ${shadowBilling.total > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>{fmtCurrency(shadowBilling.total)}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Actions */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</p>

            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-medium">Subscription Plan</p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={planVal} onValueChange={setPlanVal}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['trial','active','canceled'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={statusVal} onValueChange={setStatusVal}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['trialing','active','past_due','canceled','unpaid'].map(v => <SelectItem key={v} value={v}>{v.replace('_',' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => doAction('update_plan', { plan: planVal, subscription_status: statusVal }, 'Plan updated')} disabled={!!saving}>
                {saving === 'update_plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Plan'}
              </Button>
            </div>

            <div className="rounded-xl border bg-card p-3 space-y-2">
              <p className="text-xs font-medium">SMS Plan</p>
              <Select value={smsPlan} onValueChange={setSmsPlan}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier1">Tier 1 — 1,000 msgs/mo</SelectItem>
                  <SelectItem value="tier2">Tier 2 — 3,000 msgs/mo</SelectItem>
                  <SelectItem value="tier3">Tier 3 — 10,000 msgs/mo</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => doAction('update_sms_plan', { sms_plan: smsPlan }, 'SMS plan updated')} disabled={!!saving}>
                {saving === 'update_sms_plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save SMS Plan'}
              </Button>
            </div>

            <div className="rounded-xl border bg-card p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">SMS Overage</p>
                <p className="text-[10px] text-muted-foreground">Allow messages beyond quota at $0.08/msg</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => doAction('toggle_overage', { sms_overage_enabled: !org.sms_overage_enabled }, `Overage ${!org.sms_overage_enabled ? 'enabled' : 'disabled'}`)} disabled={!!saving}>
                {saving === 'toggle_overage' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (org.sms_overage_enabled ? 'Disable' : 'Enable')}
              </Button>
            </div>

            <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 space-y-2">
              <div>
                <p className="text-xs font-medium text-orange-800 dark:text-orange-300">Manual Override Actions</p>
                <p className="text-[10px] text-orange-700/70 dark:text-orange-400/70 mt-0.5">Use only when Stripe sync fails or customer support requires it</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs border-orange-300"
                  onClick={() => { if (!confirm('Reset the billing cycle?\n\nThis zeroes SMS + voice counts and sets cycle start to today.')) return; doAction('reset_billing', {}, 'Billing cycle reset') }}
                  disabled={!!saving}>
                  {saving === 'reset_billing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" />Billing Cycle</>}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-orange-300"
                  onClick={() => { if (!confirm('Reset SMS count to 0?\n\nOnly use if the count is wrong due to a system error.')) return; doAction('reset_sms_count', {}, 'SMS count reset') }}
                  disabled={!!saving}>
                  {saving === 'reset_sms_count' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" />SMS Count</>}
                </Button>
              </div>
            </div>

            {org.stripe_customer_id && (
              <div className="rounded-xl border bg-card p-3 space-y-3">
                <p className="text-xs font-medium">Stripe Billing</p>
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">Override trial end date</p>
                  <div className="flex gap-2">
                    <Input type="date" className="h-8 text-xs flex-1" value={trialEndDate} onChange={e => setTrialEndDate(e.target.value)} />
                    <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => doAction('set_trial_end', { trial_end: trialEndDate }, 'Trial end updated')} disabled={!!saving || !trialEndDate}>
                      {saving === 'set_trial_end' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">Add credit (reduces next invoice)</p>
                  <div className="flex gap-2">
                    <Input type="number" min="0" step="0.01" placeholder="Amount $" className="h-8 text-xs flex-1" value={creditAmt} onChange={e => setCreditAmt(e.target.value)} />
                    <Input placeholder="Reason" className="h-8 text-xs flex-1" value={creditDesc} onChange={e => setCreditDesc(e.target.value)} />
                    <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => doAction('add_credit', { credit_amount: parseFloat(creditAmt), credit_description: creditDesc }, `Credit $${creditAmt} added`)} disabled={!!saving || !creditAmt || parseFloat(creditAmt) <= 0}>
                      {saving === 'add_credit' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Credit'}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => { if (!confirm('Cancel at end of current period?')) return; doAction('cancel_subscription', { cancel_at_period_end: true }, 'Set to cancel at period end') }} disabled={!!saving}>Cancel at Period End</Button>
                  <Button size="sm" variant="destructive" className="h-8 text-xs flex-1" onClick={() => { if (!confirm('Cancel immediately? This ends access now.')) return; doAction('cancel_subscription', { cancel_at_period_end: false }, 'Subscription cancelled immediately') }} disabled={!!saving}>Cancel Now</Button>
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
                  <p className="text-[10px] text-muted-foreground">Suspended {fmtDate(org.suspended_at)}{org.suspension_reason ? ` — ${org.suspension_reason}` : ''}</p>
                  <Button size="sm" className="h-8 text-xs w-full" onClick={() => doAction('unsuspend', {}, 'Account unsuspended')} disabled={!!saving}>
                    {saving === 'unsuspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Unsuspend Account'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {showSuspendForm ? (
                    <>
                      <Input placeholder="Reason for suspension (optional)" className="h-8 text-xs" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" className="h-8 text-xs flex-1" onClick={() => { if (!confirm(`Suspend ${org.name}? All users will be locked out immediately.`)) return; doAction('suspend', { suspension_reason: suspendReason }, 'Account suspended'); setShowSuspendForm(false) }} disabled={!!saving}>
                          {saving === 'suspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Suspend'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowSuspendForm(false)}>Cancel</Button>
                      </div>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs w-full border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => setShowSuspendForm(true)}>Suspend Account</Button>
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
                    <Badge label={u.role} style={u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} />
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      )}

      {/* ── COMMUNICATIONS TAB ───────────────────────────────────────────── */}
      {activeTab === 'comms' && (
        <div className="px-4 py-4 space-y-4">

          {/* Log a note */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquarePlus className="h-3.5 w-3.5" /> Log outreach
            </p>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Log a call, email, or check-in you did manually…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
              />
              <div className="flex items-center gap-3">
                <select value={noteMethod} onChange={e => setNoteMethod(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
                  <option value="email">Email</option>
                  <option value="phone">Phone call</option>
                  <option value="sms">SMS</option>
                  <option value="in_person">In person</option>
                  <option value="other">Other</option>
                </select>
                <Button size="sm" disabled={savingNote || !noteText.trim()} onClick={saveNote} className="ml-auto gap-1.5">
                  {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Log it</>}
                </Button>
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</p>

            {commsLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!commsLoading && comms.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">No communications on record yet.</p>
            )}

            {!commsLoading && comms.length > 0 && (
              <div className="relative">
                {/* vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

                <div className="space-y-0">
                  {comms.map((item, idx) => {
                    const isOpen = expanded.has(item.id)
                    return (
                      <div key={item.id} className={`relative pl-10 ${idx < comms.length - 1 ? 'pb-4' : ''}`}>

                        {/* dot */}
                        <div className={`absolute left-2.5 top-3 h-3 w-3 rounded-full border-2 border-background ${
                          item.kind === 'email' ? 'bg-blue-400' : 'bg-emerald-400'
                        }`} />

                        <div className="rounded-xl border bg-card overflow-hidden">

                          {/* collapsed header — always visible, always clickable */}
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="w-full text-left px-3 py-3 flex items-center gap-2 hover:bg-muted/40 transition-colors"
                          >
                            <span className="text-sm shrink-0">
                              {item.kind === 'email' ? (EMAIL_ICON[item.email_type] ?? '📧') : '📝'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {item.kind === 'email' ? item.type_label : 'Outreach note'}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {item.kind === 'email' ? item.subject : item.note}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground">{fmtTime(item.ts)}</span>
                              {isOpen
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </button>

                          {/* expanded detail */}
                          {isOpen && (
                            <div className="border-t bg-muted/20 px-3 py-3 space-y-3">

                              {item.kind === 'email' && (
                                <>
                                  {/* metadata grid */}
                                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                                    <span className="text-muted-foreground font-medium">To</span>
                                    <span className="font-mono">{item.to_email || '—'}</span>
                                    <span className="text-muted-foreground font-medium">From</span>
                                    <span>DealerWyze (noreply@dealerwyze.com)</span>
                                    <span className="text-muted-foreground font-medium">Subject</span>
                                    <span>{item.subject}</span>
                                    <span className="text-muted-foreground font-medium">Type</span>
                                    <span className="font-mono">{item.email_type}</span>
                                    <span className="text-muted-foreground font-medium">Sent</span>
                                    <span>{new Date(item.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'long' })}</span>
                                    <span className="text-muted-foreground font-medium">Log ID</span>
                                    <span className="font-mono text-[10px] break-all">{item.id}</span>
                                  </div>

                                  {/* body */}
                                  {item.body_text ? (
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Message body</p>
                                      <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans bg-background rounded-lg border px-3 py-2.5 max-h-64 overflow-y-auto">
                                        {item.body_text}
                                      </pre>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground italic">Body not stored — sent before logging was added.</p>
                                  )}
                                </>
                              )}

                              {item.kind === 'note' && (
                                <>
                                  {/* metadata grid */}
                                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                                    <span className="text-muted-foreground font-medium">Logged by</span>
                                    <span>{item.admin_name}</span>
                                    <span className="text-muted-foreground font-medium">Method</span>
                                    <span>{CONTACT_METHOD_LABEL[item.contact_method ?? ''] ?? item.contact_method ?? 'Other'}</span>
                                    <span className="text-muted-foreground font-medium">When</span>
                                    <span>{new Date(item.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'long' })}</span>
                                    <span className="text-muted-foreground font-medium">Staff ID</span>
                                    <span className="font-mono text-[10px] break-all">{item.admin_user_id}</span>
                                    <span className="text-muted-foreground font-medium">Log ID</span>
                                    <span className="font-mono text-[10px] break-all">{item.id}</span>
                                  </div>

                                  {/* full note */}
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Note</p>
                                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap bg-background rounded-lg border px-3 py-2.5">
                                      {item.note}
                                    </p>
                                  </div>
                                </>
                              )}

                              {/* audit badge */}
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <ShieldCheck className="h-3 w-3 text-green-500" />
                                Immutable audit record — cannot be edited or deleted
                              </div>

                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

        </div>
      )}

    </div>
  )
}
