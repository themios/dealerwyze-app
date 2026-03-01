'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Phone, X, Loader2, Mail, CheckCircle2, AlertCircle, Plus } from 'lucide-react'

interface OrgSettings {
  name: string
  business_phone: string
  business_address: string
  timezone: string
  dealer_cell_number: string
  voice_business_hours_start: string
  voice_business_hours_end: string
  twilio_phone_number: string | null
}

interface EmailAccount {
  id: string
  label: string
  email: string
  provider: string
  enabled: boolean
  last_polled_at: string | null
  last_error: string | null
}

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/New_York',    label: 'Eastern (New York)' },
]

const EMAIL_PROVIDERS = [
  { value: 'yahoo',   label: 'Yahoo Mail',         host: 'imap.mail.yahoo.com',    note: 'Generate App Password at account.yahoo.com → Security' },
  { value: 'apple',   label: 'iCloud Mail',        host: 'imap.mail.me.com',        note: 'Generate App-Specific Password at appleid.apple.com' },
  { value: 'outlook', label: 'Outlook / Hotmail',  host: 'imap-mail.outlook.com',   note: 'Enable IMAP in Outlook Settings → Mail → Sync Email' },
  { value: 'gmail',   label: 'Gmail (App Password)', host: 'imap.gmail.com',        note: 'Generate App Password at myaccount.google.com → Security → 2-Step Verification' },
  { value: 'imap',    label: 'Other (IMAP)',        host: '',                        note: 'Contact your email provider for IMAP server settings' },
]

const PROVIDER_LABELS: Record<string, string> = {
  gmail:   'Gmail',
  yahoo:   'Yahoo',
  apple:   'iCloud',
  outlook: 'Outlook',
  imap:    'IMAP',
}

function SkeletonField() {
  return (
    <div className="space-y-1.5">
      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      <div className="h-10 w-full bg-muted rounded-md animate-pulse" />
    </div>
  )
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

function formatLastPolled(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function OrganizationPage() {
  const [form, setForm] = useState<OrgSettings>({
    name: '',
    business_phone: '',
    business_address: '',
    timezone: 'America/Los_Angeles',
    dealer_cell_number: '',
    voice_business_hours_start: '09:00',
    voice_business_hours_end: '19:00',
    twilio_phone_number: null,
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [isAdmin, setIsAdmin]   = useState(false)
  const [retellAgentId, setRetellAgentId] = useState<string | null>(null)

  // Voice agent provisioning state
  const [voiceProvisioning, setVoiceProvisioning]   = useState(false)
  const [voiceDeprovisioning, setVoiceDeprovisioning] = useState(false)
  const [voiceError, setVoiceError]                 = useState<string | null>(null)

  // Phone provisioning state
  const [provisionOpen, setProvisionOpen]   = useState(false)
  const [phoneType, setPhoneType]           = useState<'toll_free' | 'local' | 'existing'>('toll_free')
  const [areaCode, setAreaCode]             = useState('')
  const [existingNumber, setExistingNumber] = useState('')
  const [provisioning, setProvisioning]     = useState(false)
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [releasing, setReleasing]           = useState(false)

  // Email accounts state
  const [emailAccounts, setEmailAccounts]     = useState<EmailAccount[]>([])
  const [emailBanner, setEmailBanner]         = useState<'connected' | 'error' | null>(null)
  const [removingId, setRemovingId]           = useState<string | null>(null)
  const [addImapOpen, setAddImapOpen]         = useState(false)
  const [imapProvider, setImapProvider]       = useState(EMAIL_PROVIDERS[0].value)
  const [imapHost, setImapHost]               = useState(EMAIL_PROVIDERS[0].host)
  const [imapPort, setImapPort]               = useState('993')
  const [imapUser, setImapUser]               = useState('')
  const [imapPass, setImapPass]               = useState('')
  const [imapEmail, setImapEmail]             = useState('')
  const [imapLabel, setImapLabel]             = useState('')
  const [imapSaving, setImapSaving]           = useState(false)
  const [imapError, setImapError]             = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/org').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({ role: 'agent' })),
      fetch('/api/integrations/email').then(r => r.json()).catch(() => []),
    ]).then(([d, me, accounts]) => {
      setForm({
        name:                       d.name ?? '',
        business_phone:             d.business_phone ?? '',
        business_address:           d.business_address ?? '',
        timezone:                   d.timezone ?? 'America/Los_Angeles',
        dealer_cell_number:         d.dealer_cell_number ?? '',
        voice_business_hours_start: d.voice_business_hours_start ?? '09:00',
        voice_business_hours_end:   d.voice_business_hours_end ?? '19:00',
        twilio_phone_number:        d.twilio_phone_number ?? null,
      })
      setIsAdmin(me?.role === 'admin')
      setRetellAgentId(d.retell_agent_id ?? null)
      setEmailAccounts(Array.isArray(accounts) ? accounts : [])
      setLoading(false)

      // Banner after OAuth redirect
      const params = new URLSearchParams(window.location.search)
      const email = params.get('email')
      if (email === 'connected' || email === 'error') {
        setEmailBanner(email)
        window.history.replaceState({}, '', window.location.pathname)
        // Refresh account list if just connected
        if (email === 'connected') {
          fetch('/api/integrations/email').then(r => r.json()).then(a => {
            if (Array.isArray(a)) setEmailAccounts(a)
          })
        }
      }
    })
  }, [])

  function handleChange(field: keyof OrgSettings, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
  }

  async function handleProvision() {
    if (phoneType === 'local' && areaCode.length !== 3) {
      setProvisionError('Enter a 3-digit area code.')
      return
    }
    if (phoneType === 'existing' && existingNumber.replace(/\D/g, '').length < 10) {
      setProvisionError('Enter a valid 10-digit US phone number.')
      return
    }
    setProvisioning(true)
    setProvisionError(null)
    const payload = phoneType === 'existing'
      ? { type: 'existing', phone_number: existingNumber, dealership_name: form.name }
      : { type: phoneType, area_code: areaCode || undefined, dealership_name: form.name }
    const res  = await fetch('/api/admin/provision-phone', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json() as { phoneNumber?: string; error?: string }
    setProvisioning(false)
    if (!res.ok) {
      setProvisionError(data.error ?? 'Failed')
    } else {
      setForm(prev => ({ ...prev, twilio_phone_number: data.phoneNumber ?? null }))
      setProvisionOpen(false)
      setAreaCode('')
      setExistingNumber('')
    }
  }

  async function handleProvisionVoice() {
    setVoiceProvisioning(true)
    setVoiceError(null)
    const res  = await fetch('/api/admin/provision-voice', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    const data = await res.json() as { agentId?: string; error?: string }
    setVoiceProvisioning(false)
    if (!res.ok) {
      setVoiceError(data.error ?? 'Failed to provision voice agent')
    } else {
      setRetellAgentId(data.agentId ?? null)
    }
  }

  async function handleDeprovisionVoice() {
    if (!confirm('Remove the voice agent? Incoming calls will no longer be answered by AI.')) return
    setVoiceDeprovisioning(true)
    setVoiceError(null)
    await fetch('/api/admin/provision-voice', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    setVoiceDeprovisioning(false)
    setRetellAgentId(null)
  }

  async function handleRelease() {
    if (!confirm('Release this phone number? SMS and voice will stop working for this org.')) return
    setReleasing(true)
    const res = await fetch('/api/admin/provision-phone', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    setReleasing(false)
    if (res.ok) setForm(prev => ({ ...prev, twilio_phone_number: null }))
  }

  function handleProviderChange(value: string) {
    setImapProvider(value)
    const preset = EMAIL_PROVIDERS.find(p => p.value === value)
    if (preset) setImapHost(preset.host)
    setImapError(null)
  }

  async function handleAddImap() {
    if (!imapEmail || !imapHost || !imapUser || !imapPass) {
      setImapError('All fields are required.')
      return
    }
    setImapSaving(true)
    setImapError(null)
    const res  = await fetch('/api/integrations/email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        label:     imapLabel || imapEmail,
        email:     imapEmail,
        provider:  imapProvider,
        imap_host: imapHost,
        imap_port: parseInt(imapPort) || 993,
        imap_user: imapUser,
        imap_pass: imapPass,
      }),
    })
    const data = await res.json() as EmailAccount & { error?: string }
    setImapSaving(false)
    if (!res.ok) {
      setImapError(data.error ?? 'Failed to connect')
    } else {
      setEmailAccounts(prev => [...prev, data])
      setAddImapOpen(false)
      setImapUser('')
      setImapPass('')
      setImapEmail('')
      setImapLabel('')
      setImapError(null)
    }
  }

  async function handleRemoveAccount(id: string) {
    if (!confirm('Remove this email account? Lead emails from it will no longer be imported.')) return
    setRemovingId(id)
    await fetch(`/api/integrations/email/${id}`, { method: 'DELETE' })
    setRemovingId(null)
    setEmailAccounts(prev => prev.filter(a => a.id !== id))
  }

  const selectedProvider = EMAIL_PROVIDERS.find(p => p.value === imapProvider)

  return (
    <div>
      <TopBar title="Organization" />
      <div className="px-4 py-6 space-y-5">
        {loading ? (
          <>
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="org-name" className="text-sm font-medium">Dealership Name</Label>
              <Input
                id="org-name" type="text"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="Apollo Auto"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-phone" className="text-sm font-medium">Business Phone</Label>
              <Input
                id="org-phone" type="tel"
                value={form.business_phone}
                onChange={e => handleChange('business_phone', e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-address" className="text-sm font-medium">Business Address</Label>
              <Input
                id="org-address" type="text"
                value={form.business_address}
                onChange={e => handleChange('business_address', e.target.value)}
                placeholder="123 Main St, City, ST 00000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-timezone" className="text-sm font-medium">Timezone</Label>
              <Select value={form.timezone} onValueChange={v => handleChange('timezone', v)}>
                <SelectTrigger id="org-timezone" className="w-full">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SMS Phone Number */}
            {isAdmin && (
              <div className="pt-2 border-t">
                <p className="text-sm font-semibold mb-3">SMS Phone Number</p>

                {form.twilio_phone_number ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <span className="font-mono text-sm">{formatPhone(form.twilio_phone_number)}</span>
                      <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Active</span>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="text-destructive text-xs"
                      onClick={handleRelease}
                      disabled={releasing}
                    >
                      {releasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Release'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Provision a dedicated Twilio number for SMS & voice. Toll-free numbers are instant;
                      local numbers require 10DLC registration (may take days).
                    </p>

                    {!provisionOpen ? (
                      <Button variant="outline" size="sm" onClick={() => setProvisionOpen(true)}>
                        <Phone className="h-4 w-4 mr-1.5" />
                        Provision Phone Number
                      </Button>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">New Phone Number</p>
                          <button onClick={() => { setProvisionOpen(false); setProvisionError(null) }}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { value: 'toll_free', label: 'Toll-Free',       sub: 'Instant' },
                            { value: 'local',     label: 'Local',            sub: '10DLC req.' },
                            { value: 'existing',  label: 'Already own one', sub: 'BYON' },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setPhoneType(opt.value)}
                              className={`p-2.5 rounded-lg border text-left transition-colors ${phoneType === opt.value ? 'border-primary bg-primary/5' : 'border-border'}`}
                            >
                              <p className="text-xs font-medium leading-tight">{opt.label}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</p>
                            </button>
                          ))}
                        </div>

                        {phoneType === 'local' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Area Code</Label>
                            <Input
                              placeholder="818"
                              maxLength={3}
                              value={areaCode}
                              onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
                              className="h-9 font-mono"
                            />
                          </div>
                        )}

                        {phoneType === 'existing' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Your Twilio Number</Label>
                            <Input
                              placeholder="(818) 555-0100"
                              value={existingNumber}
                              onChange={e => setExistingNumber(e.target.value)}
                              className="h-9 font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              We&apos;ll update the SMS webhook automatically if the number is on our Twilio account.
                            </p>
                          </div>
                        )}

                        {provisionError && (
                          <p className="text-xs text-destructive">{provisionError}</p>
                        )}

                        <Button className="w-full" size="sm" onClick={handleProvision} disabled={provisioning}>
                          {provisioning
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Provisioning…</>
                            : 'Provision Number'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Email Lead Sync */}
            <div className="pt-2 border-t">
              <p className="text-sm font-semibold mb-3">Email Lead Sync</p>

              {emailBanner === 'connected' && (
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-green-500/10 text-green-700 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Account connected. Leads will sync every 15 minutes.
                </div>
              )}
              {emailBanner === 'error' && (
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Connection failed. Please try again.
                </div>
              )}

              {/* Connected accounts list */}
              {emailAccounts.length > 0 && (
                <div className="space-y-2 mb-3">
                  {emailAccounts.map(acct => (
                    <div key={acct.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-mono truncate">{acct.email}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {PROVIDER_LABELS[acct.provider] ?? acct.provider}
                            {' · '}
                            {acct.last_error
                              ? <span className="text-destructive">Error — check credentials</span>
                              : `Synced ${formatLastPolled(acct.last_polled_at)}`
                            }
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive text-xs shrink-0"
                        onClick={() => handleRemoveAccount(acct.id)}
                        disabled={removingId === acct.id}
                      >
                        {removingId === acct.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Remove'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {emailAccounts.length === 0 && !addImapOpen && (
                <p className="text-xs text-muted-foreground mb-3">
                  Connect an email inbox to automatically import CarGurus, AutoTrader, and OfferUp leads every 15 minutes.
                </p>
              )}

              {/* Add buttons */}
              {!addImapOpen && (
                <div className="flex flex-wrap gap-2">
                  <a href="/api/integrations/gmail/connect">
                    <Button variant="outline" size="sm">
                      <Mail className="h-4 w-4 mr-1.5" />
                      Connect Gmail
                    </Button>
                  </a>
                  <Button variant="outline" size="sm" onClick={() => setAddImapOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Account
                  </Button>
                </div>
              )}

              {/* IMAP add form */}
              {addImapOpen && (
                <div className="space-y-3 p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Add Email Account</p>
                    <button onClick={() => { setAddImapOpen(false); setImapError(null) }}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Provider</Label>
                    <Select value={imapProvider} onValueChange={handleProviderChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMAIL_PROVIDERS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProvider?.note && (
                      <p className="text-[10px] text-muted-foreground">{selectedProvider.note}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Email Address</Label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={imapEmail}
                      onChange={e => setImapEmail(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">App Password</Label>
                    <Input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={imapPass}
                      onChange={e => setImapPass(e.target.value)}
                      className="h-9 font-mono"
                    />
                  </div>

                  {imapProvider === 'imap' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">IMAP Host</Label>
                        <Input
                          placeholder="imap.example.com"
                          value={imapHost}
                          onChange={e => setImapHost(e.target.value)}
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Port</Label>
                        <Input
                          value={imapPort}
                          onChange={e => setImapPort(e.target.value.replace(/\D/g, ''))}
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {imapError && (
                    <p className="text-xs text-destructive">{imapError}</p>
                  )}

                  <Button
                    className="w-full" size="sm"
                    onClick={handleAddImap}
                    disabled={imapSaving}
                  >
                    {imapSaving
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting…</>
                      : 'Add Account'}
                  </Button>
                </div>
              )}
            </div>

            {/* Voice Agent Settings */}
            <div className="pt-2 border-t">
              <p className="text-sm font-semibold mb-3">Voice Agent</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dealer-cell" className="text-sm font-medium">Dealer Cell Number</Label>
                  <Input
                    id="dealer-cell" type="tel"
                    value={form.dealer_cell_number}
                    onChange={e => handleChange('dealer_cell_number', e.target.value)}
                    placeholder="+18054043873"
                  />
                  <p className="text-xs text-muted-foreground">Calls ring this number first during business hours (E.164 format)</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="hours-start" className="text-sm font-medium">Open</Label>
                    <Input
                      id="hours-start" type="time"
                      value={form.voice_business_hours_start}
                      onChange={e => handleChange('voice_business_hours_start', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hours-end" className="text-sm font-medium">Close</Label>
                    <Input
                      id="hours-end" type="time"
                      value={form.voice_business_hours_end}
                      onChange={e => handleChange('voice_business_hours_end', e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">After hours → voice agent answers immediately</p>

                {/* AI Agent status + provision (admin only) */}
                {isAdmin && (
                  <div className="pt-3 border-t border-dashed space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">AI Agent</p>
                      {retellAgentId
                        ? <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Active</span>
                        : <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">Not configured</span>
                      }
                    </div>
                    {!retellAgentId && !form.twilio_phone_number && (
                      <p className="text-[10px] text-muted-foreground">A phone number must be provisioned first.</p>
                    )}
                    {voiceError && <p className="text-xs text-destructive">{voiceError}</p>}
                    {retellAgentId ? (
                      <Button
                        variant="outline" size="sm"
                        className="text-destructive border-destructive/30 text-xs"
                        onClick={handleDeprovisionVoice}
                        disabled={voiceDeprovisioning}
                      >
                        {voiceDeprovisioning
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Removing…</>
                          : 'Remove Voice Agent'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline" size="sm"
                        onClick={handleProvisionVoice}
                        disabled={voiceProvisioning || !form.twilio_phone_number}
                      >
                        {voiceProvisioning
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Provisioning…</>
                          : 'Provision Voice Agent'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Google Business Profile status */}
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-sm font-semibold">Google Business Profile Reviews</p>
              <p className="text-xs text-muted-foreground">
                Polls for new reviews every 4 hours and sends a push notification.
                Add <span className="font-mono text-xs">GBP_ACCOUNT_ID</span> and{' '}
                <span className="font-mono text-xs">GBP_LOCATION_ID</span> in Vercel env to enable.
              </p>
            </div>

            <div className="pt-2">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
