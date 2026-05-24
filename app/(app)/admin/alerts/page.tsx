'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { Loader2, CheckCircle2, Copy, Check, Mail, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OrgInfo {
  id: string
  name: string
  subscription_status: string | null
  plan: string | null
  trial_ends_at: string | null
  past_due_since: string | null
  last_active_at: string | null
  monthly_message_count: number | null
  sms_quota: number | null
}

interface Alert {
  id: string
  org_id: string
  alert_type: string
  severity: string
  created_at: string
  resolved_at: string | null
  organizations: OrgInfo | null
  admin_email: string | null
}

// ── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function daysUntil(iso: string | null) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ── per-alert metadata ───────────────────────────────────────────────────────

interface AlertMeta {
  label: string
  detail: string          // what the system detected
  action: string          // what you should do, spelled out
  emailSubject?: string   // pre-filled subject for email CTA
  emailBody?: string      // pre-filled body for email CTA
  link?: string           // deep link to the relevant admin page
  linkLabel?: string
}

function buildMeta(alert: Alert): AlertMeta {
  const org = alert.organizations
  const orgName = org?.name ?? 'this account'

  switch (alert.alert_type) {

    case 'trial_expiring': {
      const days = daysUntil(org?.trial_ends_at ?? null)
      const expires = org?.trial_ends_at ? fmtDate(org.trial_ends_at) : '?'
      const daysStr = days != null
        ? days <= 0 ? 'expired today' : `expires in ${plural(days, 'day')} (${expires})`
        : `ends ${expires}`
      return {
        label: 'Trial Expiring',
        detail: `Trial ${daysStr}. No paid subscription on file.`,
        action: `Reach out to ${orgName} personally — offer a 5-min call to address any blockers, or extend their trial by a week if they seem engaged. If no response in 24h, mark this resolved and move on.`,
        emailSubject: `Quick check-in — your trial`,
        emailBody: `Hi,\n\nI noticed your trial is wrapping up ${expires}. I wanted to reach out personally — do you have any questions or is there anything I can help set up before it ends?\n\nHappy to jump on a quick call if that's easier.\n\nTim`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
    }

    case 'past_due': {
      const days = daysAgo(org?.past_due_since ?? null)
      const sinceStr = days != null ? `${plural(days, 'day')} ago` : 'recently'
      return {
        label: 'Payment Failed',
        detail: `Stripe payment failed ${sinceStr}. Subscription is now past due — access may be restricted.`,
        action: `Open Stripe and find this org's customer record to see the exact failure reason (card declined, insufficient funds, expired card, etc). If the card is declined, email the account owner to update their payment method. If it looks like a bank error or temp decline, wait 1 day — Stripe retries automatically.`,
        emailSubject: `Action needed — payment issue on your account`,
        emailBody: `Hi,\n\nWe weren't able to process your most recent payment. Your account may be affected until this is resolved.\n\nPlease update your payment method in your account settings under Billing.\n\nIf you have any questions, just reply to this email.\n\nTim`,
        link: `https://dashboard.stripe.com/customers?query=${encodeURIComponent(orgName)}`,
        linkLabel: 'Search in Stripe',
      }
    }

    case 'no_activity': {
      const days = daysAgo(org?.last_active_at ?? null)
      const lastStr = days != null ? `${plural(days, 'day')} ago` : 'over 21 days ago'
      return {
        label: 'No Activity',
        detail: `No one at ${orgName} has logged in for ${lastStr}. They may have quietly stopped using the product.`,
        action: `Send a personal check-in email — not automated, something short and direct. Ask if they ran into a problem or if something changed for them. If you get no reply within a week, consider this a silent churn and resolve the alert.`,
        emailSubject: `Checking in — everything okay?`,
        emailBody: `Hi,\n\nI noticed you haven't logged in in a little while and wanted to check in. Did you run into any issues, or has something changed on your end?\n\nIf there's anything I can help with or improve, I'd love to hear it. Happy to jump on a call too.\n\nTim`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
    }

    case 'no_email': {
      return {
        label: 'No Email Connected',
        detail: `${orgName} has no Gmail account connected. All email automations (follow-ups, reminders, sequences) are silently failing for this account.`,
        action: `Email the account owner directly and tell them to connect Gmail from Settings → Email. Without it, they're missing every automated email the system tries to send on their behalf.`,
        emailSubject: `Connect your email account — it only takes 2 minutes`,
        emailBody: `Hi,\n\nYour account doesn't have an email connected yet, which means automated follow-ups and reminders aren't going out to your leads.\n\nYou can fix this in 2 minutes: go to Settings → Email in your account and connect your Gmail.\n\nLet me know if you run into any trouble.\n\nTim`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
    }

    case 'gmail_token_expired': {
      return {
        label: 'Gmail Token Expired',
        detail: `${orgName}'s Gmail connection has expired or been revoked. Their email automations have stopped working silently.`,
        action: `Email the account owner and ask them to reconnect Gmail from Settings → Email. This usually happens when they change their Google password or revoke app access. It's a 30-second fix on their end.`,
        emailSubject: `Action needed — reconnect your Gmail`,
        emailBody: `Hi,\n\nYour Gmail connection has expired, so automated emails aren't going out right now.\n\nPlease reconnect it: go to Settings → Email in your account and click "Connect Gmail" again. Takes about 30 seconds.\n\nLet me know if you have any trouble.\n\nTim`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
    }

    case 'quota_80pct': {
      const used = org?.monthly_message_count ?? 0
      const quota = org?.sms_quota ?? 0
      return {
        label: '80% of SMS Quota Used',
        detail: `${orgName} has used ${used.toLocaleString()} of ${quota.toLocaleString()} messages this month (${Math.round((used / quota) * 100)}%). At this pace they will hit the cap before month end.`,
        action: `Check if this usage is legitimate (active campaigns, lots of leads) or if something is sending unexpectedly. If this is legitimate high-volume usage, consider increasing their quota in the org settings before they hit the wall. If something looks off, investigate first.`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org & adjust quota',
      }
    }

    case 'quota_exceeded': {
      const used = org?.monthly_message_count ?? 0
      const quota = org?.sms_quota ?? 0
      return {
        label: 'SMS Quota Exceeded',
        detail: `${orgName} has hit their monthly SMS cap — ${used.toLocaleString()} messages sent vs ${quota.toLocaleString()} allowed. New messages are being blocked right now.`,
        action: `Go to the org settings and raise their SMS quota if usage looks legitimate. If you need more time to investigate, at minimum notify the account owner so they're not wondering why messages stopped going out.`,
        emailSubject: `Your SMS limit — what to do`,
        emailBody: `Hi,\n\nYour account has reached its monthly SMS limit, so new messages are currently on hold.\n\nI'm looking into this and will get it sorted for you shortly. If you need this unblocked urgently, just reply here.\n\nTim`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org & adjust quota',
      }
    }

    case '2x_quota_exceeded': {
      const used = org?.monthly_message_count ?? 0
      const quota = org?.sms_quota ?? 0
      return {
        label: 'SMS Usage at 2x Quota',
        detail: `${orgName} has sent ${used.toLocaleString()} messages — that's ${Math.round(used / quota)}x their ${quota.toLocaleString()}-message quota. This may indicate runaway automation or they need a plan upgrade.`,
        action: `Review what's driving the volume. If it's a campaign or sequence they intentionally set up, bump their quota and consider billing for overages. If it looks unintentional (a loop, a misconfigured trigger), disable the automation and contact them.`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org & adjust quota',
      }
    }

    case 'overage_buffer_low': {
      return {
        label: 'Overage Buffer Running Low',
        detail: `${orgName}'s prepaid overage credit is nearly depleted. If it runs out, messages will start failing.`,
        action: `Check if the account owner wants to top up their overage buffer, or adjust their base quota so they don't keep hitting overages. Contact them before it runs out if volume is still high.`,
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
    }

    default:
      return {
        label: alert.alert_type,
        detail: `Unknown alert type: ${alert.alert_type}`,
        action: 'Review this org and resolve when handled.',
        link: `/admin/orgs/${alert.org_id}`,
        linkLabel: 'View org',
      }
  }
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-300 bg-red-50 dark:bg-red-950/20',
  warning:  'border-orange-300 bg-orange-50 dark:bg-orange-950/20',
  info:     'border-blue-200 bg-blue-50 dark:bg-blue-950/20',
}

// ── copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} title="Copy ID" className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AdminAlertsPage() {
  const router = useRouter()
  const [alerts, setAlerts]   = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/alerts')
      .then(r => r.json())
      .then((d: Alert[]) => { setAlerts(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function resolve(id: string) {
    setResolving(id)
    await fetch(`/api/admin/alerts/${id}/resolve`, { method: 'POST' })
    setAlerts(prev => prev.filter(a => a.id !== id))
    setResolving(null)
  }

  const open = alerts.filter(a => !a.resolved_at)

  return (
    <div>
      <TopBar title={`Alerts (${open.length})`} />
      <div className="px-4 py-4 space-y-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : open.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-sm text-muted-foreground">All clear — no open alerts.</p>
          </div>
        ) : (
          open.map(a => {
            const style = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info
            const meta  = buildMeta(a)
            const orgName = a.organizations?.name ?? 'Unknown org'

            const mailtoHref = a.admin_email && meta.emailSubject
              ? `mailto:${a.admin_email}?subject=${encodeURIComponent(meta.emailSubject)}&body=${encodeURIComponent(meta.emailBody ?? '')}`
              : null

            return (
              <div key={a.id} className={`rounded-xl border p-4 space-y-3 ${style}`}>

                {/* header */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5">{fmtDate(a.created_at)}</span>
                </div>

                {/* what the system detected */}
                <p className="text-xs text-foreground/80">{meta.detail}</p>

                {/* org identity */}
                <div className="space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Org</p>
                  <button
                    onClick={() => router.push(`/admin/orgs/${a.org_id}`)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {orgName} →
                  </button>
                  <div className="flex items-center text-[11px] text-muted-foreground font-mono">
                    <span>{a.org_id}</span>
                    <CopyButton text={a.org_id} />
                  </div>
                  {a.admin_email && (
                    <p className="text-[11px] text-muted-foreground">{a.admin_email}</p>
                  )}
                  {a.organizations?.subscription_status && (
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {a.organizations.subscription_status}{a.organizations.plan ? ` · ${a.organizations.plan}` : ''}
                    </p>
                  )}
                </div>

                {/* what to do */}
                <div className="rounded-lg bg-white/60 dark:bg-white/5 border border-black/5 px-3 py-2 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">What to do</p>
                  <p className="text-xs leading-relaxed">{meta.action}</p>
                </div>

                {/* CTAs */}
                <div className="flex items-center gap-2 flex-wrap">
                  {mailtoHref && (
                    <a href={mailtoHref}>
                      <Button size="sm" variant="default" className="h-7 text-xs gap-1.5">
                        <Mail className="h-3 w-3" />
                        Email dealer
                      </Button>
                    </a>
                  )}
                  {meta.link && (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        if (meta.link!.startsWith('http')) window.open(meta.link, '_blank')
                        else router.push(meta.link!)
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {meta.linkLabel ?? 'Open'}
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 text-xs ml-auto"
                    disabled={resolving === a.id}
                    onClick={() => resolve(a.id)}
                  >
                    {resolving === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark resolved'}
                  </Button>
                </div>

              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
