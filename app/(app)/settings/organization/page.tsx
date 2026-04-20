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
import { Phone, X, Loader2, Mail, CheckCircle2, AlertCircle, Plus, MapPin, ExternalLink, Calendar, ArrowRightLeft, Eye, EyeOff, Download, Pencil } from 'lucide-react'

interface DealerLocation {
  id: string
  name: string
  address: string
  phone: string
  is_primary: boolean
}

interface OrgSettings {
  name: string
  business_phone: string
  business_address: string
  timezone: string
  dealer_cell_number: string
  voice_business_hours_start: string
  voice_business_hours_end: string
  twilio_phone_number: string | null
  gbp_location_id: string
  resend_from_domain: string | null
  dealer_website_url: string  // full inventory page URL
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
    dealer_website_url: '',
    dealer_cell_number: '',
    voice_business_hours_start: '09:00',
    voice_business_hours_end: '19:00',
    twilio_phone_number: null,
    gbp_location_id: '',
    resend_from_domain: null,
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [isAdmin, setIsAdmin]   = useState(false)
  const [retellAgentId, setRetellAgentId] = useState<string | null>(null)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [locations, setLocations] = useState<DealerLocation[]>([])
  const [addLocOpen, setAddLocOpen] = useState(false)
  const [newLoc, setNewLoc] = useState<Omit<DealerLocation, 'id'>>({ name: '', address: '', phone: '', is_primary: false })
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocDraft, setEditLocDraft] = useState<DealerLocation | null>(null)

  // Lead import (spreadsheet)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{ created: number; duplicate: number; skipped: number; errors: number; over_limit: number } | null>(null)

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
  const [showImapPass, setShowImapPass]       = useState(false)
  const [imapEmail, setImapEmail]             = useState('')
  const [imapLabel, setImapLabel]             = useState('')
  const [imapSaving, setImapSaving]           = useState(false)
  const [imapError, setImapError]             = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editAccountIsOAuth, setEditAccountIsOAuth] = useState(false)

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
        dealer_website_url: (() => {
          const url = (d.dealer_website_url ?? '').replace(/\/$/, '')
          const path = (d.dealer_website_inventory_path ?? '').trim()
          if (!path || url.endsWith(path) || url.endsWith(path.replace(/^\//, ''))) return url || ''
          return url + (path.startsWith('/') ? path : `/${path}`)
        })(),
        dealer_cell_number:         d.dealer_cell_number ?? '',
        voice_business_hours_start: d.voice_business_hours_start ?? '09:00',
        voice_business_hours_end:   d.voice_business_hours_end ?? '19:00',
        twilio_phone_number:        d.twilio_phone_number ?? null,
        gbp_location_id:            d.gbp_location_id ?? '',
        resend_from_domain:         d.resend_from_domain ?? null,
      })
      setIsAdmin(me?.role === 'admin' || me?.role === 'dealer_admin')
      setRetellAgentId(d.retell_agent_id ?? null)
      setCalendarConnected(!!d.calendar_connected)
      setLocations(Array.isArray(d.locations) ? d.locations : [])
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

      // Calendar OAuth redirect
      const calendar = params.get('calendar')
      if (calendar === 'connected') {
        setCalendarConnected(true)
        window.history.replaceState({}, '', window.location.pathname)
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
      body:    JSON.stringify({ ...form, locations }),
    })
    setSaving(false)
    setSaved(true)
  }

  function addLocation() {
    if (!newLoc.name || !newLoc.address) return
    const loc: DealerLocation = { ...newLoc, id: crypto.randomUUID() }
    const updated = newLoc.is_primary
      ? locations.map(l => ({ ...l, is_primary: false })).concat(loc)
      : [...locations, loc]
    setLocations(updated)
    setNewLoc({ name: '', address: '', phone: '', is_primary: false })
    setAddLocOpen(false)
  }

  function removeLocation(id: string) {
    setLocations(prev => prev.filter(l => l.id !== id))
    if (editingLocationId === id) {
      setEditingLocationId(null)
      setEditLocDraft(null)
    }
  }

  function startEditLocation(loc: DealerLocation) {
    setEditingLocationId(loc.id)
    setEditLocDraft({ ...loc })
  }

  function saveEditLocation() {
    if (!editLocDraft || editLocDraft.name.trim() === '' || editLocDraft.address.trim() === '') return
    setLocations(prev => {
      const next = prev.map(l => (l.id === editLocDraft.id ? editLocDraft : l))
      if (editLocDraft.is_primary) {
        return next.map(l => (l.id === editLocDraft.id ? { ...l, is_primary: true } : { ...l, is_primary: false }))
      }
      return next
    })
    setEditingLocationId(null)
    setEditLocDraft(null)
    setSaved(false)
  }

  function cancelEditLocation() {
    setEditingLocationId(null)
    setEditLocDraft(null)
  }

  async function handleDownloadImportTemplate() {
    const res = await fetch('/api/leads/import/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportLeads() {
    if (!importFile) {
      setImportError('Choose a file first')
      return
    }
    setImportError(null)
    setImportSummary(null)
    setImportLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await fetch('/api/leads/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed')
      } else {
        setImportSummary(data.summary)
        setImportFile(null)
      }
    } catch {
      setImportError('Network error — please try again')
    } finally {
      setImportLoading(false)
    }
  }

  async function handleCalendarDisconnect() {
    if (!confirm('Disconnect Google Calendar? Appointments will no longer sync.')) return
    await fetch('/api/google/calendar-disconnect', { method: 'DELETE' })
    setCalendarConnected(false)
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
      setProvisionError(data.error ?? 'Something went wrong. Please try again or contact support.')
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
      setVoiceError(data.error ?? 'We couldn\'t turn on the AI voice agent. Try again or contact support.')
    } else {
      setRetellAgentId(data.agentId ?? null)
    }
  }

  async function handleDeprovisionVoice() {
    if (!confirm('Remove the AI voice agent? Incoming calls will no longer be answered automatically.')) return
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
    if (!confirm('Release this number? Your dealership will no longer be able to send or receive texts or take calls on it.')) return
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
    const email = imapEmail.trim()
    const user = imapUser.trim() || email
    let pass = imapPass
    if (imapProvider === 'gmail') pass = pass.replace(/\s/g, '')
    pass = pass.trim()
    if (!email || !imapHost?.trim() || !user || !pass) {
      setImapError('All fields are required.')
      return
    }
    setImapSaving(true)
    setImapError(null)
    try {
      const res  = await fetch('/api/integrations/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          label:     imapLabel?.trim() || email,
          email,
          provider:  imapProvider,
          imap_host: imapHost.trim(),
          imap_port: parseInt(imapPort) || 993,
          imap_user: user,
          imap_pass: pass,
        }),
      })
      const data = await res.json() as EmailAccount & { error?: string }
      if (!res.ok) {
        setImapError(data.error ?? 'Failed to connect')
      } else {
        setEmailAccounts(prev => [...prev, data])
        setAddImapOpen(false)
        setShowImapPass(false)
        setImapUser('')
        setImapPass('')
        setImapEmail('')
        setImapLabel('')
        setImapError(null)
      }
    } catch {
      setImapError('Connection timed out. Check your credentials and try again.')
    } finally {
      setImapSaving(false)
    }
  }

  async function handleRemoveAccount(id: string) {
    if (!confirm('Remove this email account? Lead emails from it will no longer be imported.')) return
    setRemovingId(id)
    await fetch(`/api/integrations/email/${id}`, { method: 'DELETE' })
    setRemovingId(null)
    setEmailAccounts(prev => prev.filter(a => a.id !== id))
    if (editingAccountId === id) {
      setEditingAccountId(null)
      setEditAccountIsOAuth(false)
    }
  }

  async function startEditAccount(acct: EmailAccount) {
    const res = await fetch(`/api/integrations/email/${acct.id}`)
    if (!res.ok) return
    const data = await res.json() as { id: string; label: string; email: string; provider: string; imap_host?: string; imap_port?: number; imap_user?: string }
    setAddImapOpen(false)
    setEditingAccountId(acct.id)
    setEditAccountIsOAuth(!data.imap_host)
    setImapLabel(data.label ?? '')
    setImapEmail(data.email ?? '')
    setImapProvider(data.provider ?? 'imap')
    const preset = EMAIL_PROVIDERS.find(p => p.value === (data.provider ?? 'imap'))
    setImapHost(data.imap_host ?? preset?.host ?? '')
    setImapPort(String(data.imap_port ?? 993))
    setImapUser(data.imap_user ?? data.email ?? '')
    setImapPass('')
    setImapError(null)
    setShowImapPass(false)
  }

  function cancelEditAccount() {
    setEditingAccountId(null)
    setEditAccountIsOAuth(false)
    setImapLabel('')
    setImapEmail('')
    setImapUser('')
    setImapPass('')
    setImapError(null)
  }

  async function handleUpdateAccount() {
    if (!editingAccountId) return
    if (editAccountIsOAuth) {
      const label = imapLabel.trim() || imapEmail.trim()
      if (!label) {
        setImapError('Label is required')
        return
      }
      setImapSaving(true)
      setImapError(null)
      const res = await fetch(`/api/integrations/email/${editingAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label }),
      })
      const data = await res.json() as EmailAccount & { error?: string }
      setImapSaving(false)
      if (!res.ok) {
        setImapError(data.error ?? 'Update failed')
      } else {
        setEmailAccounts(prev => prev.map(a => a.id === editingAccountId ? data : a))
        setEditingAccountId(null)
        setEditAccountIsOAuth(false)
      }
      return
    }
    const email = imapEmail.trim()
    const user = imapUser.trim() || email
    const pass = imapPass.trim()
    if (!email || !imapHost?.trim() || !user) {
      setImapError('Email, host, and user are required.')
      return
    }
    setImapSaving(true)
    setImapError(null)
    try {
      const body: Record<string, unknown> = {
        label:     imapLabel.trim() || email,
        email,
        provider:  imapProvider,
        imap_host: imapHost.trim(),
        imap_port: parseInt(imapPort) || 993,
        imap_user: user,
      }
      if (pass) body.imap_pass = pass
      const res = await fetch(`/api/integrations/email/${editingAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as EmailAccount & { error?: string }
      if (!res.ok) {
        setImapError(data.error ?? 'Update failed')
      } else {
        setEmailAccounts(prev => prev.map(a => a.id === editingAccountId ? data : a))
        setEditingAccountId(null)
        setEditAccountIsOAuth(false)
        setImapPass('')
        setShowImapPass(false)
      }
    } catch {
      setImapError('Connection timed out. Check your credentials and try again.')
    } finally {
      setImapSaving(false)
    }
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
                placeholder="My Auto Group"
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

            <div className="pt-2 border-t space-y-3">
              <p className="text-sm font-semibold">Inventory page URL</p>
              <p className="text-xs text-muted-foreground">
                Full URL of your dealership’s inventory or cars-for-sale page. Used by inventory sync and email template <code className="bg-muted px-1 rounded">{'{link}'}</code>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="org-inventory-url" className="text-sm font-medium">URL</Label>
                <Input
                  id="org-inventory-url"
                  type="url"
                  value={form.dealer_website_url}
                  onChange={e => handleChange('dealer_website_url', e.target.value)}
                  placeholder="https://www.yourdealer.com/cars-for-sale"
                />
              </div>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="mt-2">
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
              </Button>
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
                      Get a business phone number for texts and calls. Toll-free is ready immediately;
                      local numbers may take a few days to activate.
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
                          <button onClick={() => { setProvisionOpen(false); setProvisionError(null) }} title="Close">
                            <X className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { value: 'toll_free', label: 'Toll-Free',        sub: 'Ready now' },
                            { value: 'local',     label: 'Local number',     sub: 'May take a few days' },
                            { value: 'existing',  label: 'I have a number',  sub: 'Use my existing number' },
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
                            <Label className="text-xs">Your phone number</Label>
                            <Input
                              placeholder="(818) 555-0100"
                              value={existingNumber}
                              onChange={e => setExistingNumber(e.target.value)}
                              className="h-9 font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              If we already manage this number for you, we&apos;ll connect it so texts and calls work right away. No extra setup needed.
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
              {emailAccounts.length > 0 && !editingAccountId && (
                <div className="space-y-2 mb-3">
                  {emailAccounts.map(acct => (
                    <div key={acct.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{acct.label || acct.email}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{acct.email}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {PROVIDER_LABELS[acct.provider] ?? acct.provider}
                            {' · '}
                            {acct.last_error
                              ? (acct.last_error.includes('invalid_grant') || acct.last_error.includes('expired') || acct.last_error.includes('reconnect'))
                                ? <a href="/api/integrations/gmail/connect" className="text-amber-600 font-medium underline">Connection expired - tap to reconnect</a>
                                : <span className="text-destructive">Sync error - check credentials</span>
                              : acct.enabled
                                ? <span suppressHydrationWarning>Synced {formatLastPolled(acct.last_polled_at)}</span>
                                : <span className="text-amber-600">Paused</span>
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => startEditAccount(acct)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-destructive text-xs"
                          onClick={() => handleRemoveAccount(acct.id)}
                          disabled={removingId === acct.id}
                        >
                          {removingId === acct.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {emailAccounts.length === 0 && !addImapOpen && !editingAccountId && (
                <p className="text-xs text-muted-foreground mb-3">
                  Connect an email inbox to automatically import CarGurus, AutoTrader, and OfferUp leads every 15 minutes.
                </p>
              )}

              {/* Edit email account form */}
              {editingAccountId && (
                <div className="space-y-3 p-3 rounded-lg border bg-card mb-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{editAccountIsOAuth ? 'Edit account label' : 'Edit Email Account'}</p>
                    <button onClick={cancelEditAccount} className="text-muted-foreground hover:text-foreground" title="Close">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {editAccountIsOAuth ? (
                    <div className="space-y-2">
                      <Label className="text-xs">Display name (e.g. Main Inbox)</Label>
                      <Input
                        placeholder="Label"
                        value={imapLabel}
                        onChange={e => setImapLabel(e.target.value)}
                        className="h-9"
                      />
                      <p className="text-[10px] text-muted-foreground">For Gmail you can only change the label. To use a different Gmail account, remove this one and connect again.</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Label (optional)</Label>
                        <Input placeholder="e.g. Main Inbox" value={imapLabel} onChange={e => setImapLabel(e.target.value)} className="h-9" />
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
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email Address</Label>
                        <Input type="email" placeholder="you@example.com" value={imapEmail} onChange={e => setImapEmail(e.target.value)} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">App Password (leave blank to keep current)</Label>
                        <div className="relative">
                          <Input
                            type={showImapPass ? 'text' : 'password'}
                            placeholder="••••••••••••••••"
                            value={imapPass}
                            onChange={e => setImapPass(e.target.value)}
                            className="h-9 font-mono pr-9"
                          />
                          <button type="button" onClick={() => setShowImapPass(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded" aria-label={showImapPass ? 'Hide password' : 'Show password'} title={showImapPass ? 'Hide password' : 'Show password'}>
                            {showImapPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {imapProvider === 'imap' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">IMAP Host</Label>
                            <Input placeholder="imap.example.com" value={imapHost} onChange={e => setImapHost(e.target.value)} className="h-9 font-mono text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Port</Label>
                            <Input value={imapPort} onChange={e => setImapPort(e.target.value.replace(/\D/g, ''))} className="h-9 font-mono text-xs" />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">IMAP User (if different from email)</Label>
                        <Input placeholder="Leave blank to use email" value={imapUser} onChange={e => setImapUser(e.target.value)} className="h-9" />
                      </div>
                    </>
                  )}
                  {imapError && <p className="text-xs text-destructive">{imapError}</p>}
                  <Button className="w-full" size="sm" onClick={handleUpdateAccount} disabled={imapSaving}>
                    {imapSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Updating…</> : 'Update'}
                  </Button>
                </div>
              )}

              {/* Add buttons */}
              {!addImapOpen && !editingAccountId && (
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
                    <button onClick={() => { setAddImapOpen(false); setImapError(null); setShowImapPass(false) }} title="Close">
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
                    <div className="relative">
                      <Input
                        type={showImapPass ? 'text' : 'password'}
                        placeholder="••••••••••••••••"
                        value={imapPass}
                        onChange={e => setImapPass(e.target.value)}
                        className="h-9 font-mono pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowImapPass(p => !p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded"
                        aria-label={showImapPass ? 'Hide password' : 'Show password'}
                        title={showImapPass ? 'Hide password' : 'Show password'}
                      >
                        {showImapPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {imapProvider === 'gmail' && (
                      <p className="text-[10px] text-muted-foreground">
                        Use a Gmail App Password, not your regular password. Create one at myaccount.google.com → Security → 2-Step Verification → App passwords.
                      </p>
                    )}
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

              {/* Lead Import */}
              <div className="pt-2 border-t">
                <p className="text-sm font-semibold mb-2">Lead Import</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload a CSV or Excel file with columns for Name and Phone or Email. Use the template or your own — we recognize many column names.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2"
                    onClick={handleDownloadImportTemplate}
                  >
                    <Download className="h-4 w-4" />
                    Download template (CSV)
                  </Button>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium">Your file (CSV or XLSX, max 2 MB, 500 rows)</label>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:text-sm"
                      onChange={e => {
                        setImportFile(e.target.files?.[0] ?? null)
                        setImportError(null)
                        setImportSummary(null)
                      }}
                    />
                  </div>
                  {importError && <p className="text-xs text-destructive">{importError}</p>}
                  {importSummary && (
                    <div className="rounded-lg border bg-muted/50 p-2 text-xs space-y-0.5">
                      <p className="font-medium">Import complete</p>
                      <p>{importSummary.created} created</p>
                      {importSummary.duplicate > 0 && <p>{importSummary.duplicate} duplicates skipped</p>}
                      {importSummary.skipped > 0 && <p>{importSummary.skipped} skipped (no name or contact)</p>}
                      {importSummary.errors > 0 && <p>{importSummary.errors} errors</p>}
                      {importSummary.over_limit > 0 && <p className="text-muted-foreground">First 500 rows only; {importSummary.over_limit} not imported.</p>}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleImportLeads}
                    disabled={importLoading || !importFile}
                  >
                    {importLoading ? 'Importing…' : 'Import'}
                  </Button>
                </div>
              </div>
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
                    placeholder="+15555550100"
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
                      <p className="text-[10px] text-muted-foreground">Add a business phone number above first. The AI voice agent uses that number for calls.</p>
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

            {/* Google Business Profile */}
            <div className="pt-2 border-t">
              <p className="text-sm font-semibold mb-3">Google Business Profile</p>
              <div className="space-y-1.5">
                <Label htmlFor="gbp-location-id" className="text-sm font-medium">GBP Location ID</Label>
                <Input
                  id="gbp-location-id" type="text"
                  value={form.gbp_location_id}
                  onChange={e => handleChange('gbp_location_id' as keyof OrgSettings, e.target.value)}
                  placeholder="locations/1234567890"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Find this in your Google Business Profile URL.
                  <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                    Open GBP <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>

            {/* Google Calendar OAuth */}
            <div className="pt-2 border-t">
              <p className="text-sm font-semibold mb-3">Google Calendar</p>
              {calendarConnected ? (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">Connected</p>
                      <p className="text-xs text-muted-foreground">Appointments sync to Google Calendar</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCalendarDisconnect} className="text-destructive border-destructive/30 text-xs">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Connect to sync appointment bookings to Google Calendar.</p>
                  <a href="/api/google/calendar-connect">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="h-4 w-4" />
                      Connect Google Calendar
                    </Button>
                  </a>
                </div>
              )}
            </div>

            {/* Dealer Locations */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Locations</p>
                <Button variant="outline" size="sm" onClick={() => setAddLocOpen(p => !p)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>

              {addLocOpen && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2 mb-3">
                  <Input placeholder="Location Name (e.g. Main Lot)" value={newLoc.name} onChange={e => setNewLoc(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
                  <Input placeholder="Address" value={newLoc.address} onChange={e => setNewLoc(p => ({ ...p, address: e.target.value }))} className="h-9 text-sm" />
                  <Input placeholder="Phone (optional)" value={newLoc.phone} onChange={e => setNewLoc(p => ({ ...p, phone: e.target.value }))} className="h-9 text-sm" />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={newLoc.is_primary} onChange={e => setNewLoc(p => ({ ...p, is_primary: e.target.checked }))} className="rounded" />
                    Set as primary location
                  </label>
                  <Button size="sm" onClick={addLocation} className="w-full">Add Location</Button>
                </div>
              )}

              <div className="space-y-2">
                {locations.map(loc => (
                  <div key={loc.id} className="flex items-start justify-between p-3 rounded-lg border bg-card gap-2">
                    {editingLocationId === loc.id && editLocDraft?.id === loc.id ? (
                      <div className="flex-1 space-y-2 min-w-0">
                        <Input
                          placeholder="Location Name"
                          value={editLocDraft.name}
                          onChange={e => setEditLocDraft(d => d ? { ...d, name: e.target.value } : null)}
                          className="h-9 text-sm"
                        />
                        <Input
                          placeholder="Address"
                          value={editLocDraft.address}
                          onChange={e => setEditLocDraft(d => d ? { ...d, address: e.target.value } : null)}
                          className="h-9 text-sm"
                        />
                        <Input
                          placeholder="Phone (optional)"
                          value={editLocDraft.phone}
                          onChange={e => setEditLocDraft(d => d ? { ...d, phone: e.target.value } : null)}
                          className="h-9 text-sm"
                        />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={editLocDraft.is_primary}
                            onChange={e => setEditLocDraft(d => d ? { ...d, is_primary: e.target.checked } : null)}
                            className="rounded"
                          />
                          Set as primary location
                        </label>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={cancelEditLocation}>Cancel</Button>
                          <Button size="sm" onClick={saveEditLocation} disabled={!editLocDraft.name.trim() || !editLocDraft.address.trim()}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <p className="text-sm font-medium truncate">{loc.name}</p>
                            {loc.is_primary && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Primary</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">{loc.address}</p>
                          {loc.phone && <p className="text-xs text-muted-foreground ml-5">{loc.phone}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEditLocation(loc)} className="p-1.5 text-muted-foreground hover:text-foreground rounded" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeLocation(loc.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded" title="Remove">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {locations.length === 0 && (
                  <p className="text-xs text-muted-foreground">No locations added yet.</p>
                )}
              </div>
            </div>

            {/* Email from domain (read-only) */}
            {form.resend_from_domain && (
              <div className="pt-2 border-t">
                <p className="text-sm font-semibold mb-2">Email From Domain</p>
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/40">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-mono">{form.resend_from_domain}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Contact{' '}
                  <a href="mailto:support@dealerwyze.com" className="underline">support@dealerwyze.com</a>
                  {' '}to configure a custom email domain.
                </p>
              </div>
            )}

            <div className="pt-2">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </div>

            {isAdmin && (
              <div className="border-t pt-4 mt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Danger Zone</p>
                <a href="/settings/transfer" className="flex items-center gap-2 w-full rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors">
                  <ArrowRightLeft className="h-4 w-4 shrink-0" />
                  Transfer Business Ownership
                </a>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Sell or transfer this dealership to a new owner. Your account will be deactivated.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
