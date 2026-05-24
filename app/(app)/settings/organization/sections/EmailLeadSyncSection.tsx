'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mail, X, Loader2, CheckCircle2, AlertCircle, Plus, Eye, EyeOff, Download, Pencil } from 'lucide-react'
import { inferLeadSourceEmailMatcherType } from '@/lib/leads/sourceMatchers'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

interface EmailAccount {
  id: string
  label: string
  email: string
  provider: string
  enabled: boolean
  last_polled_at: string | null
  last_error: string | null
}

interface LeadSourceEmailMatcher {
  type: 'exact' | 'domain' | 'contains'
  value: string
}

const EMAIL_PROVIDERS = [
  { value: 'yahoo',   label: 'Yahoo Mail',           host: 'imap.mail.yahoo.com',    note: 'Generate App Password at account.yahoo.com → Security' },
  { value: 'apple',   label: 'iCloud Mail',          host: 'imap.mail.me.com',        note: 'Generate App-Specific Password at appleid.apple.com' },
  { value: 'outlook', label: 'Outlook / Hotmail',    host: 'imap-mail.outlook.com',   note: 'Enable IMAP in Outlook Settings → Mail → Sync Email' },
  { value: 'gmail',   label: 'Gmail (App Password)', host: 'imap.gmail.com',          note: 'Generate App Password at myaccount.google.com → Security → 2-Step Verification' },
  { value: 'imap',    label: 'Other (IMAP)',          host: '',                        note: 'Contact your email provider for IMAP server settings' },
]

const PROVIDER_LABELS: Record<string, string> = {
  gmail:   'Gmail',
  yahoo:   'Yahoo',
  apple:   'iCloud',
  outlook: 'Outlook',
  imap:    'IMAP',
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

export default function EmailLeadSyncSection({ isRE = false }: { isRE?: boolean }) {
  const [emailAccounts, setEmailAccounts]         = useState<EmailAccount[]>([])
  const [emailBanner, setEmailBanner]             = useState<'connected' | 'error' | null>(null)
  const [removingId, setRemovingId]               = useState<string | null>(null)
  const [addImapOpen, setAddImapOpen]             = useState(false)
  const [imapProvider, setImapProvider]           = useState(EMAIL_PROVIDERS[0].value)
  const [imapHost, setImapHost]                   = useState(EMAIL_PROVIDERS[0].host)
  const [imapPort, setImapPort]                   = useState('993')
  const [imapUser, setImapUser]                   = useState('')
  const [imapPass, setImapPass]                   = useState('')
  const [showImapPass, setShowImapPass]           = useState(false)
  const [imapEmail, setImapEmail]                 = useState('')
  const [imapLabel, setImapLabel]                 = useState('')
  const [imapSaving, setImapSaving]               = useState(false)
  const [imapError, setImapError]                 = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId]   = useState<string | null>(null)
  const [editAccountIsOAuth, setEditAccountIsOAuth] = useState(false)

  // Lead import
  const [importFile, setImportFile]       = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError]     = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{ created: number; duplicate: number; skipped: number; errors: number; over_limit: number } | null>(null)
  const [leadMatchers, setLeadMatchers] = useState<LeadSourceEmailMatcher[]>([])
  const [leadMatcherDraft, setLeadMatcherDraft] = useState('')
  const [leadMatcherSaving, setLeadMatcherSaving] = useState(false)
  const [leadMatcherError, setLeadMatcherError] = useState<string | null>(null)
  const [leadMatcherSaved, setLeadMatcherSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/integrations/email').then(r => r.json()).catch(() => []),
      fetch('/api/settings/org').then(r => r.json()).catch(() => null),
    ]).then(([accounts, settings]) => {
      if (Array.isArray(accounts)) setEmailAccounts(accounts)
      if (settings && Array.isArray(settings.lead_source_email_matchers)) {
        setLeadMatchers(settings.lead_source_email_matchers)
      }
    })

    const params = new URLSearchParams(window.location.search)
    const email = params.get('email')
    if (email === 'connected' || email === 'error') {
      setEmailBanner(email as 'connected' | 'error')
      window.history.replaceState({}, '', window.location.pathname)
      if (email === 'connected') {
        fetch('/api/integrations/email').then(r => r.json()).then(a => {
          if (Array.isArray(a)) setEmailAccounts(a)
        })
      }
    }
  }, [])

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

  async function saveLeadMatchers(next: LeadSourceEmailMatcher[]) {
    setLeadMatcherSaving(true)
    setLeadMatcherError(null)
    setLeadMatcherSaved(false)
    try {
      const res = await fetch('/api/settings/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_source_email_matchers: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLeadMatcherError(data.error ?? 'Could not save lead sender rules')
        return false
      }
      setLeadMatchers(Array.isArray(data.lead_source_email_matchers) ? data.lead_source_email_matchers : next)
      setLeadMatcherSaved(true)
      window.setTimeout(() => setLeadMatcherSaved(false), 2500)
      return true
    } catch {
      setLeadMatcherError('Could not save lead sender rules')
      return false
    } finally {
      setLeadMatcherSaving(false)
    }
  }

  async function handleAddLeadMatcher() {
    const value = leadMatcherDraft.trim().toLowerCase()
    if (!value) return
    const type = inferLeadSourceEmailMatcherType(value)
    const next = [...leadMatchers, { type, value }]
    const ok = await saveLeadMatchers(next)
    if (ok) setLeadMatcherDraft('')
  }

  async function handleRemoveLeadMatcher(value: string, type: LeadSourceEmailMatcher['type']) {
    const next = leadMatchers.filter(m => !(m.value === value && m.type === type))
    await saveLeadMatchers(next)
  }

  const selectedProvider = EMAIL_PROVIDERS.find(p => p.value === imapProvider)

  return (
    <div className="px-4 pt-2 border-t">
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
                        ? // eslint-disable-next-line @next/next/no-html-link-for-pages
                          <a href="/api/integrations/gmail/connect" className="text-amber-600 font-medium underline">Connection expired - tap to reconnect</a>
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
                <ConfirmActionDialog
                  title="Remove this email account?"
                  description="Lead emails from this inbox will no longer be imported until you reconnect it."
                  confirmLabel={removingId === acct.id ? 'Removing...' : 'Remove account'}
                  confirmVariant="destructive"
                  onConfirm={() => handleRemoveAccount(acct.id)}
                  trigger={(
                    <Button
                      variant="ghost" size="sm"
                      className="text-destructive text-xs"
                      disabled={removingId === acct.id}
                    >
                      {removingId === acct.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Remove'}
                    </Button>
                  )}
                />
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

      <div className="mt-4 space-y-3 rounded-lg border bg-card p-3">
        <div>
          <p className="text-sm font-medium">Lead Sender Rules</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add extra sender emails or partial domains that should be treated as lead-source messages across every connected inbox. Built-in marketplace rules stay active automatically.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Add a sender match</Label>
          <div className="flex gap-2">
            <Input
              placeholder={isRE ? 'zillow.com, realtor.com, or leads@zillow.com' : 'cargurus, carsforsale.com, or dealer-leads@messages.cargurus.com'}
              value={leadMatcherDraft}
              onChange={e => {
                setLeadMatcherDraft(e.target.value)
                setLeadMatcherError(null)
                setLeadMatcherSaved(false)
              }}
              className="h-9"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddLeadMatcher}
              disabled={leadMatcherSaving || !leadMatcherDraft.trim()}
            >
              {leadMatcherSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            We auto-detect exact email, domain, or partial contains matching. Very short partials are ignored to avoid false positives.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Custom rules</Label>
          <div className="flex flex-wrap gap-2">
            {leadMatchers.map(matcher => (
              <Badge key={`${matcher.type}:${matcher.value}`} variant="secondary" className="gap-1.5 pr-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{matcher.type}</span>
                <span>{matcher.value}</span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-black/10"
                  onClick={() => handleRemoveLeadMatcher(matcher.value, matcher.type)}
                  aria-label={`Remove ${matcher.value}`}
                  title="Remove"
                  disabled={leadMatcherSaving}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        {leadMatcherError && <p className="text-xs text-destructive">{leadMatcherError}</p>}
        {leadMatcherSaved && <p className="text-xs text-green-700">Lead sender rules saved.</p>}

        <div className="space-y-1">
          <Label className="text-xs">Examples</Label>
          <Textarea
            readOnly
            value={isRE
              ? 'leads@zillow.com\nrealtor.com\nhomes.com\nredfin.com'
              : 'dealer-leads@messages.cargurus.com\ncarsforsale.com\nautotrader\ncargurus'}
            className="min-h-20 resize-none text-xs"
          />
        </div>
      </div>

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
          <Button asChild variant="outline" size="sm">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/integrations/gmail/connect">
              <Mail className="h-4 w-4 mr-1.5" />
              Connect Gmail
            </a>
          </Button>
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
  )
}
