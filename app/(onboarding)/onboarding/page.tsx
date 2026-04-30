'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2, CheckCircle2, Building2, Car, Mail, Users,
  Plus, Trash2, ChevronRight, AlertCircle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrgSettings {
  onboarding_step: number
  onboarding_completed_at: string | null
  business_name: string | null
  business_phone: string | null
  business_address: string | null
  zip_code: string | null
  timezone: string | null
  voice_business_hours_start: string | null
  voice_business_hours_end: string | null
}

interface VinData { year: number; make: string; model: string; trim: string }

const TOTAL_STEPS = 5
const STEP_LABELS = ['Your Dealership', 'First Vehicle', 'Lead Inbox', 'Your Team', 'Ready!']
const TIMEZONES = [
  'America/Los_Angeles','America/Denver','America/Chicago',
  'America/New_York','America/Phoenix','Pacific/Honolulu',
]
const ROLE_OPTIONS = [
  { value: 'dealer_admin',   label: 'Admin (full access)' },
  { value: 'dealer_manager', label: 'Manager' },
  { value: 'dealer_finance', label: 'Finance' },
  { value: 'dealer_staff',   label: 'Staff' },
  { value: 'dealer_rep',     label: 'Sales Rep (limited)' },
]

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100)
  return (
    <div className="px-6 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span className="text-xs text-muted-foreground">{STEP_LABELS[step]}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 transition-colors ${
              i < step ? 'bg-primary border-primary' :
              i === step ? 'border-primary bg-background' : 'border-muted bg-muted'
            }`}>
              {i < step && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
              {i === step && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </div>
            <span className="text-[9px] text-muted-foreground hidden sm:block">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 1: Dealership Profile ────────────────────────────────────────────────
function StepProfile({ settings, orgName, onNext }: {
  settings: OrgSettings | null; orgName: string; onNext: (data: object) => Promise<void>
}) {
  const [name,   setName]   = useState(orgName || '')
  const [dba,    setDba]    = useState(settings?.business_name    || '')
  const [phone,  setPhone]  = useState(settings?.business_phone   || '')
  const [addr,   setAddr]   = useState(settings?.business_address || '')
  const [zip,    setZip]    = useState(settings?.zip_code         || '')
  const [tz,     setTz]     = useState(settings?.timezone         || 'America/Los_Angeles')
  const [start,  setStart]  = useState(settings?.voice_business_hours_start || '09:00')
  const [end,    setEnd]    = useState(settings?.voice_business_hours_end   || '18:00')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  async function handleNext() {
    if (!name.trim()) { setErr('Dealership name is required'); return }
    setSaving(true); setErr(null)
    await onNext({
      orgName: name.trim(),
      settings: {
        business_name: dba.trim() || name.trim(),
        business_phone: phone.trim(),
        business_address: addr.trim(),
        zip_code: zip.trim(),
        timezone: tz,
        voice_business_hours_start: start,
        voice_business_hours_end: end,
      },
    })
    setSaving(false)
  }

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><Building2 className="h-6 w-6 text-primary" /></div>
        <div>
          <h2 className="text-xl font-bold">Your Dealership</h2>
          <p className="text-sm text-muted-foreground">Used in messages, reports, and your AI voice agent.</p>
        </div>
      </div>

      {err && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{err}</div>}

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium block mb-1">Dealership Name <span className="text-destructive">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Apollo Auto"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">DBA / Trade Name <span className="text-xs text-muted-foreground">(if different)</span></label>
          <input value={dba} onChange={e => setDba(e.target.value)} placeholder="Same as above"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Business Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(626) 555-0100"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Street Address</label>
          <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="1234 Main St, El Monte, CA"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Zip Code</label>
          <input value={zip} onChange={e => setZip(e.target.value)} placeholder="91731" maxLength={10}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <p className="text-xs text-muted-foreground mt-1">Used for local market pricing data</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Timezone</label>
          <select value={tz} onChange={e => setTz(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
            {TIMEZONES.map(t => <option key={t} value={t}>{t.replace('America/', '').replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Business Hours</label>
          <div className="flex items-center gap-2">
            <input type="time" value={start} onChange={e => setStart(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-sm text-muted-foreground">to</span>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Your AI voice agent uses these hours</p>
        </div>
      </div>

      <Button className="w-full" onClick={handleNext} disabled={saving || !name.trim()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save and Continue <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}

// ── Step 2: First Vehicle ─────────────────────────────────────────────────────
function StepVehicle({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [vin,      setVin]      = useState('')
  const [vinData,  setVinData]  = useState<VinData | null>(null)
  const [price,    setPrice]    = useState('')
  const [mileage,  setMileage]  = useState('')
  const [decoding, setDecoding] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [added,    setAdded]    = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  async function decodeVin() {
    if (vin.length < 11) { setErr('Enter at least 11 characters of the VIN'); return }
    setDecoding(true); setErr(null)
    try {
      const res  = await fetch('/api/vehicles/intake/vin-decode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vin }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Decode failed')
      setVinData({ year: json.year, make: json.make, model: json.model, trim: json.trim })
    } catch {
      setErr('Could not decode that VIN. Check the number and try again, or skip this step.')
    } finally { setDecoding(false) }
  }

  async function addVehicle() {
    if (!vinData) return
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin,
          year: vinData.year, make: vinData.make, model: vinData.model, trim: vinData.trim,
          price:   price   ? parseInt(price.replace(/\D/g, ''),   10) : null,
          mileage: mileage ? parseInt(mileage.replace(/\D/g, ''), 10) : null,
          status: 'available',
        }),
      })
      if (!res.ok) throw new Error('Failed to add')
      setAdded(true)
      setTimeout(() => onNext(), 1500)
    } catch {
      setErr('Could not add vehicle. Try again or skip this step.')
    } finally { setSaving(false) }
  }

  if (added) return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center gap-4 px-6">
      <CheckCircle2 className="h-12 w-12 text-green-500" />
      <p className="font-semibold text-lg">Vehicle added!</p>
      <p className="text-sm text-muted-foreground">Moving to the next step...</p>
    </div>
  )

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><Car className="h-6 w-6 text-primary" /></div>
        <div>
          <h2 className="text-xl font-bold">Add Your First Vehicle</h2>
          <p className="text-sm text-muted-foreground">Enter a VIN and we&apos;ll fill in the details. Add the rest later.</p>
        </div>
      </div>

      {err && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{err}</div>}

      <div>
        <label className="text-sm font-medium block mb-1">VIN</label>
        <div className="flex gap-2">
          <input value={vin} onChange={e => { setVin(e.target.value.toUpperCase()); setVinData(null) }}
            placeholder="1HGCM82633A123456" maxLength={17}
            className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <Button variant="outline" onClick={decodeVin} disabled={decoding || vin.length < 11}>
            {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Decode'}
          </Button>
        </div>
      </div>

      {vinData && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">{vinData.year} {vinData.make} {vinData.model} {vinData.trim}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Asking Price</label>
              <input value={price} onChange={e => setPrice(e.target.value)} placeholder="$12,995"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Mileage</label>
              <input value={mileage} onChange={e => setMileage(e.target.value)} placeholder="42,000"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <Button onClick={addVehicle} disabled={saving} className="w-full">
            {saving ? 'Adding...' : 'Add Vehicle'}
          </Button>
        </div>
      )}

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
        Skip - I&apos;ll add inventory later
      </Button>
    </div>
  )
}

// ── Step 3: Connect Gmail ─────────────────────────────────────────────────────
function StepGmail({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [connected, setConnected] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('gmail_connected') === '1'
  })
  const [showImap, setShowImap] = useState(false)
  const [imapProvider, setImapProvider] = useState<'outlook' | 'yahoo' | 'apple' | 'gmail_app' | 'imap'>('outlook')
  const [imapHost, setImapHost] = useState('imap-mail.outlook.com')
  const [imapPort, setImapPort] = useState('993')
  const [imapEmail, setImapEmail] = useState('')
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [imapSaving, setImapSaving] = useState(false)
  const [imapError, setImapError] = useState<string | null>(null)

  useEffect(() => {
    if (connected) {
      window.history.replaceState({}, '', '/onboarding')
      setTimeout(() => onNext(), 1500)
    }
  }, [connected, onNext])

  function handleProviderChange(p: typeof imapProvider) {
    setImapProvider(p)
    setImapError(null)
    if (p === 'outlook') {
      setImapHost('imap-mail.outlook.com')
      setImapPort('993')
    } else if (p === 'yahoo') {
      setImapHost('imap.mail.yahoo.com')
      setImapPort('993')
    } else if (p === 'apple') {
      setImapHost('imap.mail.me.com')
      setImapPort('993')
    } else if (p === 'gmail_app') {
      setImapHost('imap.gmail.com')
      setImapPort('993')
    } else {
      setImapHost('')
      setImapPort('993')
    }
  }

  async function connectImap(e: React.FormEvent) {
    e.preventDefault()
    setImapError(null)
    if (!imapEmail || !imapHost || !imapUser || !imapPass) {
      setImapError('Email, server, username, and password are required.')
      return
    }
    setImapSaving(true)
    try {
      const res = await fetch('/api/integrations/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: imapEmail,
          email: imapEmail,
          provider: imapProvider,
          imap_host: imapHost,
          imap_port: parseInt(imapPort, 10) || 993,
          imap_user: imapUser,
          imap_pass: imapPass,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImapError(data.error || 'Connection failed. Check your settings and try again.')
        setImapSaving(false)
        return
      }
      setConnected(true)
      setImapSaving(false)
      setTimeout(() => onNext(), 1500)
    } catch {
      setImapError('Connection failed. Check your settings and try again.')
      setImapSaving(false)
    }
  }

  if (connected) return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center gap-4 px-6">
      <CheckCircle2 className="h-12 w-12 text-green-500" />
      <p className="font-semibold text-lg">Inbox connected!</p>
      <p className="text-sm text-muted-foreground">Leads from your email will start flowing in within 15 minutes.</p>
    </div>
  )

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><Mail className="h-6 w-6 text-primary" /></div>
        <div>
          <h2 className="text-xl font-bold">Connect Your Lead Inbox</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll pull leads from the inbox where your CarGurus, AutoTrader, and website leads land today.
          </p>
        </div>
      </div>

      <div className="bg-muted/40 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold">What DealerWyze reads:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li className="flex gap-1.5"><span className="text-green-500 font-bold">+</span> Lead emails from CarGurus, AutoTrader, Cars.com, Facebook</li>
          <li className="flex gap-1.5"><span className="text-green-500 font-bold">+</span> Direct customer inquiries</li>
          <li className="flex gap-1.5"><span className="text-green-500 font-bold">+</span> Full reply threads so you see the whole conversation</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          We never send emails without your action. Read-only access unless you reply from within the app.
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/api/integrations/gmail/connect?from=onboarding"
          className="flex items-center justify-center gap-2 w-full bg-white border-2 border-border rounded-lg px-4 py-3 text-sm font-semibold hover:bg-accent transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Connect Gmail / Google Workspace
        </Link>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Not using Gmail? Connect another provider like Outlook, Yahoo, iCloud, or your own domain.
          </p>
          <Button
            variant="outline"
            className="w-full text-sm"
            type="button"
            onClick={() => setShowImap(s => !s)}
          >
            {showImap ? 'Hide other providers' : 'Connect another email provider'}
          </Button>
        </div>
      </div>

      {showImap && (
        <form onSubmit={connectImap} className="space-y-3 border border-border rounded-lg p-4 bg-background">
          {imapError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
              <p>{imapError}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Provider
            </label>
            <select
              value={imapProvider}
              onChange={e => handleProviderChange(e.target.value as typeof imapProvider)}
              className="w-full border rounded-md px-2 py-2 text-sm bg-background"
            >
              <option value="outlook">Outlook / Office 365</option>
              <option value="yahoo">Yahoo Mail</option>
              <option value="apple">iCloud / Apple Mail</option>
              <option value="gmail_app">Gmail (App Password)</option>
              <option value="imap">Other (IMAP)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Email Address
            </label>
            <Input
              type="email"
              value={imapEmail}
              onChange={e => setImapEmail(e.target.value)}
              placeholder="you@yourdealer.com"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              IMAP Server
            </label>
            <div className="flex gap-2">
              <Input
                value={imapHost}
                onChange={e => setImapHost(e.target.value)}
                placeholder="imap.mail.yourprovider.com"
                className="h-9 text-sm flex-1"
              />
              <Input
                value={imapPort}
                onChange={e => setImapPort(e.target.value)}
                placeholder="993"
                className="h-9 text-sm w-20"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Username
            </label>
            <Input
              value={imapUser}
              onChange={e => setImapUser(e.target.value)}
              placeholder="Usually your full email address"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              App Password
            </label>
            <Input
              type="password"
              value={imapPass}
              onChange={e => setImapPass(e.target.value)}
              placeholder="App-specific password if required"
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Many providers require an app-specific password for IMAP (Outlook, Yahoo, iCloud, Gmail with 2FA).
            </p>
            {imapProvider === 'yahoo' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1">
                Yahoo does not accept your regular password. Create an App Password at account.yahoo.com → Account Security → Generate app password, then enter it above.
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full h-9 text-sm font-semibold"
            disabled={imapSaving}
          >
            {imapSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Connecting…
              </>
            ) : (
              'Connect inbox'
            )}
          </Button>
        </form>
      )}

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
        Skip - I&apos;ll connect email later in Settings
      </Button>
    </div>
  )
}

// ── Step 4: Invite Team ───────────────────────────────────────────────────────
function StepTeam({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [members, setMembers] = useState([{ email: '', role: 'dealer_staff' }])
  const [saving,  setSaving]  = useState(false)
  const [invited, setInvited] = useState(0)
  const [err,     setErr]     = useState<string | null>(null)

  async function sendInvites() {
    const valid = members.filter(m => m.email.trim().includes('@'))
    if (!valid.length) { setErr('Add at least one email address to invite'); return }
    setSaving(true); setErr(null)
    let count = 0
    for (const m of valid) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: m.email.trim(), role: m.role }),
        })
        if (res.ok) count++
      } catch { /* continue */ }
    }
    setInvited(count)
    setSaving(false)
    if (count > 0) setTimeout(() => onNext(), 1500)
    else setErr('Could not send invites. You can add team members later in Settings.')
  }

  if (invited > 0) return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center gap-4 px-6">
      <Users className="h-12 w-12 text-primary" />
      <p className="font-semibold text-lg">{invited} invite{invited !== 1 ? 's' : ''} sent!</p>
      <p className="text-sm text-muted-foreground">They&apos;ll get an email to set up their account.</p>
    </div>
  )

  return (
    <div className="flex-1 px-6 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
        <div>
          <h2 className="text-xl font-bold">Invite Your Team</h2>
          <p className="text-sm text-muted-foreground">Each person gets their own login. Add more in Settings anytime.</p>
        </div>
      </div>

      {err && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{err}</div>}

      <div className="space-y-2">
        {members.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input type="email" value={m.email} onChange={e => setMembers(ms => ms.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
              placeholder="jane@mydealer.com"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={m.role} onChange={e => setMembers(ms => ms.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
              className="border rounded-lg px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {members.length > 1 && (
              <button type="button" onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setMembers(ms => [...ms, { email: '', role: 'dealer_staff' }])}
        className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity">
        <Plus className="h-4 w-4" /> Add another person
      </button>

      <Button className="w-full" onClick={sendInvites} disabled={saving}>
        {saving ? 'Sending...' : 'Send Invites and Continue'} <ChevronRight className="h-4 w-4 ml-1" />
      </Button>

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
        Skip - I&apos;ll add team members later
      </Button>
    </div>
  )
}

function StepComplete({ businessName, onFinish, finishing }: {
  businessName: string; onFinish: () => void; finishing: boolean
}) {
  return (
    <div className="flex-1 px-4 py-4 sm:px-6 sm:py-6 flex flex-col gap-4">
      <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm">
        <div className="bg-[#0D2B55] px-5 py-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
            DealerWyze
          </p>
          <h2 className="mt-2 text-lg sm:text-xl font-bold text-white">
            You&apos;re in{businessName ? `, ${businessName}` : ''}. Let&apos;s turn more leads into sold deals.
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-blue-100 max-w-xl">
            You&apos;ve just given your dealership a single place for leads, follow-ups, and customer conversations.
            From here on, every morning starts with a clear list of who needs you — and every deal has a clean trail
            from first click to sold.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Triune framing */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 uppercase mb-1">
                Confidence &amp; Safety
              </p>
              <p className="text-xs text-emerald-900 leading-relaxed">
                DealerWyze keeps you from missing the leads and follow-ups that silently cost you real money.
                When it&apos;s in the system, it&apos;s on your radar.
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-indigo-900 uppercase mb-1">
                Status &amp; Team
              </p>
              <p className="text-xs text-slate-800 leading-relaxed">
                You&apos;re now running the same follow-up playbook as top-performing stores that treat every
                opportunity like it matters — and your team sees your work, not just the results.
              </p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-800 uppercase mb-1">
                Clarity &amp; Control
              </p>
              <p className="text-xs text-amber-900 leading-relaxed">
                Every screen is built to answer one thing: &ldquo;What should I do next to move deals forward?&rdquo;
                Start with the areas below.
              </p>
            </div>
          </div>

          {/* Main feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                1. Today Page
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Start here every morning
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                See who&apos;s waiting for a reply, what&apos;s overdue, and what&apos;s coming up. Protect every opportunity
                without digging through inboxes and sticky notes.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>Clear list of customers who need a call, text, or email</li>
                <li>Instant view of what&apos;s urgent versus what can wait</li>
                <li>Daily habit that keeps your pipeline moving</li>
              </ul>
              <Link href="/today" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Open Today and clear the list &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                2. Lead Inbox
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                One place for every new opportunity
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Leads from CarGurus, AutoTrader, your website, Facebook, and email all land in one queue.
                Reply by text or email without ever leaving DealerWyze.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>No more hunting across inboxes and logins</li>
                <li>Every message is saved to the customer&apos;s timeline</li>
                <li>Faster responses that win more conversations</li>
              </ul>
              <Link href="/customers" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Open the Lead Inbox and reply to one new lead &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                3. Inventory &amp; Market Intelligence
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Price to win, not guess
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                See each vehicle with live market context: competition, days on market, and pricing guidance.
                Spot cars that are invisible or overpriced and fix them before they go stale.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>Understand which units are underpriced or stuck</li>
                <li>Make faster price and promotion decisions</li>
                <li>Turn inventory without sacrificing margin</li>
              </ul>
              <Link href="/vehicles" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Run Market Intelligence on 3 aging units &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                4. Customer Profiles
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Every conversation in one timeline
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Calls, texts, emails, notes, and vehicles all live in a single view per customer.
                Anyone on your team can pick up the conversation without asking, &ldquo;What happened last time?&rdquo;
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>Instant context before every call or message</li>
                <li>Professional, consistent communication every time</li>
                <li>Trust-building experience customers can feel</li>
              </ul>
              <Link href="/customers" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Open an active deal and scan the full timeline &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                5. Automation &amp; Templates
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Keep your follow-up tight on autopilot
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Save the messages you send every day as simple, human templates. Turn on light automation to bump
                stale leads and key events without sounding like a robot.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>More touches with less typing</li>
                <li>A consistent voice across your whole team</li>
                <li>Follow-up that feels intentional, not random</li>
              </ul>
              <Link href="/settings/automation" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Save one of your go-to follow-ups as a template &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-900 uppercase">
                6. Mobile &amp; Voice Assistant
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Run the store from anywhere — even after hours
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                DealerWyze is built to be mobile-friendly so you can check Today, reply to leads,
                and update notes from the lot, the lane, or your couch.
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                When you&apos;re ready, turn on the <span className="font-semibold text-lime-700">AI Voice Assistant</span>
                so missed calls after hours become new leads in your inbox by morning.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>Stay in control of your pipeline from your phone</li>
                <li>Never let after-hours calls die in voicemail</li>
                <li>Operate like a bigger store without a bigger payroll</li>
              </ul>
              <Link href="/settings/organization" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Explore Voice Assistant settings &rarr;
              </Link>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-orange-800 uppercase">
                7. Video &amp; Social
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Get more eyes on your inventory, automatically
              </p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Connect your Facebook, Instagram, TikTok, and YouTube accounts. When you list a car, DealerWyze
                creates a branded narrated video and posts it to all your social accounts without you lifting a finger.
              </p>
              <ul className="mt-2 text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
                <li>AI-narrated video with your dealer branding and phone number</li>
                <li>Posts to all connected platforms automatically</li>
                <li>50 free listing videos per month included</li>
              </ul>
              <Link href="/settings/social" className="mt-2 inline-flex text-[11px] font-semibold text-[#F07018] hover:underline">
                Connect your social accounts &rarr;
              </Link>
            </div>
          </div>

          <div className="pt-3 mt-1 border-t border-slate-200 text-[11px] text-slate-500">
            <p className="font-semibold text-slate-800">DealerWyze</p>
            <p className="mt-0.5">
              One place for your leads, follow-ups, and customer conversations — so your team can sell more without burning out.
            </p>
            <p className="mt-0.5">
              Make DealerWyze the first tab you open every morning and the last one you close at night. The heavier you use it,
              the more it will grow your store.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-2 flex flex-col gap-3">
        <div className="bg-muted/40 rounded-xl p-3 text-center text-xs sm:text-sm text-muted-foreground">
          Questions? Text Tim at{' '}
          <a href="sms:+18054043873" className="font-semibold text-foreground hover:text-primary">(805) 404-3873</a>
          {' '}or email{' '}
          <a href="mailto:support@dealerwyze.com" className="font-semibold text-foreground hover:text-primary">support@dealerwyze.com</a>
        </div>

        <Button className="w-full" size="lg" onClick={onFinish} disabled={finishing}>
          {finishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Go to My Dashboard
        </Button>
      </div>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step,      setStep]      = useState(0)
  const [settings,  setSettings]  = useState<OrgSettings | null>(null)
  const [orgName,   setOrgName]   = useState('')
  const [loading,   setLoading]   = useState(true)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    fetch('/api/onboarding')
      .then(r => r.json())
      .then((d: { org: { name: string } | null; settings: OrgSettings | null }) => {
        setSettings(d.settings)
        setOrgName(d.org?.name ?? '')
        if (d.settings?.onboarding_completed_at) { router.replace('/today'); return }
        setStep(d.settings?.onboarding_step ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function advance(nextStep: number, body: Record<string, unknown> = {}) {
    await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: nextStep, ...body }),
    }).catch(() => null)
    if (body.orgName) setOrgName(body.orgName as string)
    setStep(nextStep)
  }

  async function finish() {
    setFinishing(true)
    await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complete: true }),
    }).catch(() => null)
    router.replace('/today')
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="flex flex-col flex-1">
      <div className="px-6 pt-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">DealerWyze Setup</p>
      </div>

      <ProgressBar step={step} />

      {step === 0 && (
        <StepProfile settings={settings} orgName={orgName}
          onNext={async (body) => advance(1, body as Record<string, unknown>)} />
      )}
      {step === 1 && <StepVehicle onNext={() => advance(2)} onSkip={() => advance(2)} />}
      {step === 2 && <StepGmail  onNext={() => advance(3)} onSkip={() => advance(3)} />}
      {step === 3 && <StepTeam   onNext={() => advance(4)} onSkip={() => advance(4)} />}
      {step === 4 && <StepComplete businessName={orgName} onFinish={finish} finishing={finishing} />}

      {step > 0 && step < 4 && (
        <div className="px-6 pb-4">
          <button onClick={() => setStep(s => s - 1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back
          </button>
        </div>
      )}
    </div>
  )
}
