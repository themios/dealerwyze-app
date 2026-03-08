'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Check, ChevronRight, Mail, Users, Zap } from 'lucide-react'

const TOTAL_STEPS = 5

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Pacific/Honolulu',
]

const PLANS = [
  {
    id: 'beta',
    name: 'Beta Access',
    price: 'Free — no card needed',
    features: ['Full CRM access during beta', 'Up to 200 contacts & 100 vehicles', 'AI tools, BHPH, analytics included'],
    popular: true,
  },
  {
    id: 'tier1',
    name: 'Complete CRM',
    price: '$150/mo (launching after beta)',
    features: ['Unlimited contacts & leads', 'Two-way SMS + dedicated number', 'Fax, AI tools, BHPH, team access'],
  },
  {
    id: 'tier2',
    name: 'CRM + Voice AI',
    price: '$350/mo (launching after beta)',
    features: ['Everything in Complete CRM', 'AI voice agent answers calls 24/7', '1,000 voice minutes/month included'],
  },
]

interface OrgSettings {
  onboarding_step: number
  onboarding_completed_at: string | null
  business_name: string | null
  business_phone: string | null
  business_address: string | null
  timezone: string | null
}


function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 px-6 py-4">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-primary' : i === step - 1 ? 'bg-primary/60' : 'bg-muted'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Business Info ────────────────────────────────────────────────────
function Step1({
  settings, onNext,
}: {
  settings: OrgSettings | null
  onNext: (data: { settings: Record<string, string> }) => Promise<void>
}) {
  const [name,    setName]    = useState(settings?.business_name    ?? '')
  const [phone,   setPhone]   = useState(settings?.business_phone   ?? '')
  const [address, setAddress] = useState(settings?.business_address ?? '')
  const [tz,      setTz]      = useState(settings?.timezone         ?? 'America/Los_Angeles')
  const [saving,  setSaving]  = useState(false)

  async function handleNext() {
    setSaving(true)
    await onNext({ settings: { business_name: name, business_phone: phone, business_address: address, timezone: tz } })
    setSaving(false)
  }

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div>
        <h2 className="text-xl font-bold">Tell us about your dealership</h2>
        <p className="text-sm text-muted-foreground mt-1">This info appears in your SMS templates and reports.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bname">Dealership name</Label>
          <Input id="bname" value={name} onChange={e => setName(e.target.value)} placeholder="My Auto Group" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bphone">Business phone</Label>
          <Input id="bphone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(818) 555-0100" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="baddress">Address</Label>
          <Input id="baddress" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, CA 90001" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tz">Timezone</Label>
          <select
            id="tz"
            value={tz}
            onChange={e => setTz(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TIMEZONES.map(t => (
              <option key={t} value={t}>{t.replace('America/', '').replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <Button className="w-full" onClick={handleNext} disabled={saving || !name.trim()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Continue <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}

// ── Step 2: Choose Plan ──────────────────────────────────────────────────────
function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div>
        <h2 className="text-xl font-bold">Your plan</h2>
        <p className="text-sm text-muted-foreground mt-1">You&apos;re on beta access — full features at no charge while we build together.</p>
      </div>

      <div className="space-y-3">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`rounded-xl border p-4 space-y-2 relative ${plan.popular ? 'border-primary' : ''}`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 left-4 text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                Most popular
              </span>
            )}
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm">{plan.name}</p>
                <p className="text-xs text-muted-foreground">{plan.price}</p>
              </div>
              <a
                href={`/settings/billing`}
                className="text-xs text-primary font-medium hover:underline"
              >
                Subscribe →
              </a>
            </div>
            <ul className="space-y-0.5">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-green-500 shrink-0" />{f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Button className="w-full" onClick={onNext}>
          I&apos;ve subscribed — Continue <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
          Skip for now (trial mode)
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Connect Email ────────────────────────────────────────────────────
function Step3({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Connect email leads</h2>
          <p className="text-sm text-muted-foreground">Auto-import CarGurus &amp; AutoTrader leads.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Gmail (recommended)</p>
        <p className="text-xs text-muted-foreground">
          Connect the Gmail account where CarGurus, AutoTrader, and other lead sources
          send notifications. We&apos;ll auto-import new leads every 15 minutes.
        </p>
        <a href="/api/integrations/gmail/connect" className="block">
          <Button variant="outline" className="w-full text-sm">
            <Mail className="h-4 w-4 mr-2" /> Connect Gmail account
          </Button>
        </a>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">Other providers</p>
        <p className="text-xs text-muted-foreground">
          Yahoo, iCloud, Outlook, or custom IMAP — configure in{' '}
          <a href="/settings/organization" className="text-primary hover:underline">Settings → Organization</a>.
        </p>
      </div>

      <div className="space-y-2 pt-2">
        <Button className="w-full" onClick={onNext}>
          I&apos;ve connected email — Continue <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
          Skip — I&apos;ll set this up later
        </Button>
      </div>
    </div>
  )
}

// ── Step 4: Team Setup ───────────────────────────────────────────────────────
function Step4({
  onNext, onSkip,
}: {
  onNext: () => void
  onSkip: () => void
}) {
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then((d: { users?: Array<{ role: string; invite_code?: string }> }) => {
        const admin = d.users?.find(u => u.role === 'admin')
        if (admin?.invite_code) setInviteCode(admin.invite_code)
      })
      .catch(() => null)
  }, [])

  function copyCode() {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Invite your team</h2>
          <p className="text-sm text-muted-foreground">Sales agents share your CRM workspace.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Your invite code</p>
        <p className="text-xs text-muted-foreground">
          Share this code with salespeople. They sign up at your app URL and enter this code to join your dealership.
        </p>
        {inviteCode ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm font-mono tracking-widest">
              {inviteCode}
            </code>
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : 'Copy'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Loading invite code…</p>
        )}
        <p className="text-xs text-muted-foreground">
          Manage team members anytime in{' '}
          <a href="/settings/users" className="text-primary hover:underline">Settings → Team</a>.
        </p>
      </div>

      <div className="space-y-2 pt-2">
        <Button className="w-full" onClick={onNext}>
          Continue <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
          Skip — just me for now
        </Button>
      </div>
    </div>
  )
}

// ── Step 5: Done ─────────────────────────────────────────────────────────────
function Step5({ businessName, onFinish, finishing }: {
  businessName: string; onFinish: () => void; finishing: boolean
}) {
  return (
    <div className="flex-1 px-6 py-8 flex flex-col items-center justify-center text-center space-y-6">
      <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
        <Zap className="h-10 w-10 text-green-600" />
      </div>

      <div>
        <h2 className="text-2xl font-bold">You&apos;re all set{businessName ? `, ${businessName}` : ''}!</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your CRM is ready. Start adding customers, responding to leads, and closing deals.
        </p>
      </div>

      <div className="w-full space-y-2 text-left rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What&apos;s next</p>
        {[
          'Add your first customer or import from leads',
          'Set up SMS templates in Settings',
          'Configure billing to unlock full features',
          'Ask your account manager about Voice AI',
        ].map(tip => (
          <div key={tip} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{tip}</p>
          </div>
        ))}
      </div>

      <Button className="w-full" size="lg" onClick={onFinish} disabled={finishing}>
        {finishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Go to Dashboard
      </Button>
    </div>
  )
}

// ── Main Wizard ──────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step,     setStep]     = useState(1)
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    fetch('/api/onboarding')
      .then(r => r.json())
      .then((d: { settings: OrgSettings | null }) => {
        setSettings(d.settings)
        if (d.settings?.onboarding_completed_at) {
          router.replace('/today')
          return
        }
        setStep(d.settings?.onboarding_step ?? 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function advance(nextStep: number, body: Record<string, unknown> = {}) {
    await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: nextStep, ...body }),
    })
    setStep(nextStep)
    if (body.settings) {
      setSettings(prev => prev ? { ...prev, ...body.settings as Partial<OrgSettings> } : prev)
    }
  }

  async function finish() {
    setFinishing(true)
    await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complete: true }),
    })
    router.replace('/today')
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="px-6 pt-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Setup — Step {step} of {TOTAL_STEPS}
        </p>
      </div>

      <ProgressBar step={step} />

      {/* Step content */}
      {step === 1 && (
        <Step1
          settings={settings}
          onNext={async (body) => { await advance(2, body) }}
        />
      )}
      {step === 2 && (
        <Step2
          onNext={() => advance(3)}
          onSkip={() => advance(3)}
        />
      )}
      {step === 3 && (
        <Step3
          onNext={() => advance(4)}
          onSkip={() => advance(4)}
        />
      )}
      {step === 4 && (
        <Step4
          onNext={() => advance(5)}
          onSkip={() => advance(5)}
        />
      )}
      {step === 5 && (
        <Step5
          businessName={settings?.business_name ?? ''}
          onFinish={finish}
          finishing={finishing}
        />
      )}
    </div>
  )
}
