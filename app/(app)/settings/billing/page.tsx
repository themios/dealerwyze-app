'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertCircle, CreditCard, MessageSquare, Zap, ScanLine } from 'lucide-react'
import { PLAN_LABEL, PLAN_PRICE, SMS_TIER_PRICE, SMS_TIER_LABEL, SMS_TIER_QUOTA, SMS_OVERAGE_RATE, type PlanTier, type SmsTier } from '@/lib/stripeConstants'

interface BillingStatus {
  plan: string
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  has_sms_addon: boolean
  sms_plan: PlanTier | null
  sms_quota: number | null
  monthly_message_count: number | null
  monthly_mms_count: number | null
  billing_cycle_end: string | null
  voice_minutes_quota: number | null
  monthly_voice_seconds: number | null
  monthly_scan_image_count: number | null
  monthly_scan_pdf_count: number | null
}

function QuotaBar({ used, quota, label }: { used: number; quota: number; label: string }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  const color =
    pct >= 95 ? 'bg-red-500' :
    pct >= 80 ? 'bg-amber-500' :
    'bg-green-500'

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used.toLocaleString()} / {quota.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{pct}% used</p>
    </div>
  )
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)

  async function load() {
    const res = await fetch('/api/stripe/billing-status')
    const d = await res.json()
    setStatus(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSubscribe(plan: PlanTier, smsTier?: SmsTier) {
    setRedirecting(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, ...(smsTier ? { smsTier } : {}) }),
    })
    const { url } = await res.json()
    window.location.href = url
  }

  async function handlePortal() {
    setRedirecting(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url } = await res.json()
    window.location.href = url
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const isActive   = status?.subscription_status === 'active' || status?.subscription_status === 'trialing'
  const isTrial    = status?.subscription_status === 'trialing'
  const isPastDue  = status?.subscription_status === 'past_due'
  const hasStripe  = !!status?.stripe_customer_id
  const smsPlan    = status?.sms_plan ?? 'tier1'
  const hasSms     = smsPlan === 'tier2'

  const trialEnd  = status?.trial_ends_at    ? new Date(status.trial_ends_at)    : null
  const periodEnd = status?.current_period_end ? new Date(status.current_period_end) : null
  const cycleEnd  = status?.billing_cycle_end  ? new Date(status.billing_cycle_end)  : null
  const daysLeft  = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000) : null

  const smsUsed       = status?.monthly_message_count ?? 0
  const mmsUsed       = status?.monthly_mms_count ?? 0
  const smsQuota      = status?.sms_quota ?? 0
  const voiceSeconds  = status?.monthly_voice_seconds ?? 0
  const voiceMinQuota = status?.voice_minutes_quota ?? 0
  const voiceMinUsed  = Math.floor(voiceSeconds / 60)
  const hasVoice      = voiceMinQuota > 0

  // Scan quotas — indexed by plan tier
  const SCAN_IMG_QUOTA: Record<string, number> = { tier1: 100, tier2: 200, tier3: 500 }
  const SCAN_PDF_QUOTA: Record<string, number> = { tier1: 25,  tier2: 50,  tier3: 150 }
  const planKey       = (status?.plan ?? 'tier1') as string
  const scanImgLimit  = SCAN_IMG_QUOTA[planKey] ?? 100
  const scanPdfLimit  = SCAN_PDF_QUOTA[planKey] ?? 25
  const scanImgUsed   = status?.monthly_scan_image_count ?? 0
  const scanPdfUsed   = status?.monthly_scan_pdf_count ?? 0

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-base font-semibold">Billing & Plan</h2>

      {/* Status card */}
      <div className={`rounded-xl border p-4 ${isPastDue ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
        <div className="flex items-center gap-2 mb-3">
          {isActive && !isPastDue
            ? <CheckCircle className="h-5 w-5 text-green-500" />
            : <AlertCircle className="h-5 w-5 text-destructive" />}
          <span className="font-medium text-sm">
            {status?.subscription_status === 'free'
              ? 'Beta — Free Access'
              : isTrial
                ? 'Free Trial'
                : isActive
                  ? `DealerWyze — ${PLAN_LABEL[smsPlan as PlanTier] ?? 'Active'}`
                  : isPastDue
                    ? 'Payment Failed'
                    : 'Subscription Inactive'}
          </span>
        </div>

        {isTrial && daysLeft !== null && (
          <p className="text-sm text-muted-foreground mb-3">
            {daysLeft > 0 ? `${daysLeft} days remaining in your trial` : 'Trial expired'}
          </p>
        )}
        {isActive && !isTrial && periodEnd && (
          <p className="text-sm text-muted-foreground mb-3" suppressHydrationWarning>
            Next billing: {periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
        {isPastDue && (
          <p className="text-sm text-destructive mb-3">Your last payment failed. Please update your payment method.</p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">
              ${PLAN_PRICE[smsPlan as PlanTier] ?? '0'}
              <span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {smsPlan === 'tier2' ? 'Voice AI add-on · AI receptionist · 24/7 call handling' : 'CRM · Calendar · Gmail leads'}
            </p>
          </div>
          {hasStripe ? (
            <Button size="sm" variant={isPastDue ? 'default' : 'outline'} onClick={handlePortal} disabled={redirecting}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              {isPastDue ? 'Fix Payment' : 'Manage'}
            </Button>
          ) : (
            <div className="flex flex-col gap-2 items-end">
              <Button size="sm" variant="outline" onClick={() => handleSubscribe('tier1')} disabled={redirecting}>
                Complete CRM — $150/mo
              </Button>
              <Button size="sm" onClick={() => handleSubscribe('tier2')} disabled={redirecting}>
                CRM + Voice AI — $350/mo
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* SMS Usage bar — only show for Tier 2 active subscribers */}
      {hasStripe && isActive && hasSms && smsQuota > 0 && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">SMS Usage This Month</p>
            {cycleEnd && (
              <span className="ml-auto text-xs text-muted-foreground" suppressHydrationWarning>
                Resets {cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <QuotaBar used={smsUsed} quota={smsQuota} label="Total messages" />
          <QuotaBar used={mmsUsed} quota={50} label="MMS messages (cap: 50)" />
          {smsUsed > smsQuota && (
            <p className="text-xs text-amber-600 font-medium">
              {(smsUsed - smsQuota).toLocaleString()} overage messages · billed at {`$${SMS_OVERAGE_RATE.toFixed(2)}/msg`}
            </p>
          )}
        </div>
      )}

      {/* SMS tier upgrade — show for Tier 1 (no SMS) or active SMS users who can upgrade */}
      {hasStripe && isActive && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">{hasSms ? 'Upgrade SMS Volume' : 'Add SMS Messaging'}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Dedicated business number · Two-way texting · TCPA compliant
          </p>
          <div className="grid grid-cols-1 gap-2">
            {((['smsTier1', 'smsTier2', 'smsTier3'] as SmsTier[])).map((st) => {
              const quota = SMS_TIER_QUOTA[st]
              const price = SMS_TIER_PRICE[st]
              const label = SMS_TIER_LABEL[st]
              const isCurrentTier =
                (smsPlan === 'tier2' && st === 'smsTier1') ||
                (smsPlan as string) === st
              return (
                <div key={st} className={`flex items-center justify-between rounded-lg border p-3 ${isCurrentTier ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">{quota >= 10000 ? 'Unlimited' : quota.toLocaleString()} msgs/mo</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">${price}/mo</span>
                    {isCurrentTier ? (
                      <span className="text-xs text-blue-600 font-medium px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded-full">Current</span>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => handleSubscribe('tier1', st)} disabled={redirecting}>
                        {hasSms ? 'Switch' : 'Select'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {!hasSms && (
            <p className="text-xs text-muted-foreground">Requires Complete CRM ($150/mo)</p>
          )}
        </div>
      )}

      {/* Voice usage bar — only for active voice plans */}
      {hasVoice && isActive && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            <p className="text-sm font-medium">Voice Agent Usage This Month</p>
            {cycleEnd && (
              <span className="ml-auto text-xs text-muted-foreground">
                Resets {cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <QuotaBar used={voiceMinUsed} quota={voiceMinQuota} label="Minutes used" />
        </div>
      )}

      {/* Scan quota usage — shown for all active plans */}
      {isActive && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-medium">AI Lead Scan Usage This Month</p>
            {cycleEnd && (
              <span className="ml-auto text-xs text-muted-foreground" suppressHydrationWarning>
                Resets {cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <QuotaBar used={scanImgUsed} quota={scanImgLimit} label="Image scans" />
          <QuotaBar used={scanPdfUsed} quota={scanPdfLimit} label="PDF scans" />
          <p className="text-xs text-muted-foreground">
            Scans available on Customers page (camera / photos / files)
          </p>
        </div>
      )}

      {/* Voice Assistant upsell — only for non-voice subscribers */}
      {!hasVoice && (
        <div className="rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">Voice Agent</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI answers missed calls · captures name, vehicle, timeline · creates CRM lead instantly
              </p>
              <p className="text-sm font-semibold mt-2">$200/month</p>
            </div>
            <span className="text-xs bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium self-start">Add-on</span>
          </div>
        </div>
      )}

      {/* What's included */}
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What&apos;s included</p>
        {[
          { tag: 'CRM', text: 'Unlimited customers, leads & activity tracking' },
          { tag: 'CRM', text: 'Inventory management' },
          { tag: 'CRM', text: 'Calendar & appointment booking' },
          { tag: 'CRM', text: 'Gmail lead capture' },
          { tag: 'CRM', text: 'BHPH portfolio tracking' },
          { tag: 'CRM', text: 'Receipt-to-Ledger (AI OCR)' },
          { tag: 'SMS', text: 'Dedicated business phone number' },
          { tag: 'SMS', text: '1,000 SMS/MMS messages per month' },
          { tag: 'SMS', text: 'Two-way texting · TCPA compliant' },
          { tag: 'SMS', text: 'Auto lead-response tasks' },
        ].map(({ tag, text }) => {
          const active = tag === 'CRM' || hasSms
          return (
            <div key={text} className={`flex items-center gap-2 text-sm ${!active ? 'opacity-40' : ''}`}>
              <CheckCircle className={`h-4 w-4 flex-shrink-0 ${tag === 'SMS' ? 'text-blue-500' : 'text-green-500'}`} />
              <span>{text}</span>
              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${tag === 'SMS' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{tag}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
