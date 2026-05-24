'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Copy, Check, Webhook } from 'lucide-react'

interface OrgWebhook {
  id: string
  url: string
  events: string[]
  active: boolean
  created_at: string
}

const ALL_EVENTS = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'stage_change', label: 'Stage Change' },
  { value: 'appointment_created', label: 'Appointment Created' },
  { value: 'bhph_payment_received', label: 'BHPH Payment Received', dealerOnly: true },
]

function SecretBox({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Save this secret - you will not see it again
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-white dark:bg-black/30 border rounded px-2 py-1.5 font-mono break-all select-all">
          {secret}
        </code>
        <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-500">
        Use this to verify the <code className="font-mono">X-DealerWyze-Signature</code> header on incoming webhook requests.
      </p>
    </div>
  )
}

interface AddFormProps {
  onAdded: (hook: OrgWebhook & { secret: string }) => void
  isRe?: boolean
}

function AddWebhookForm({ onAdded, isRe = false }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [urlError, setUrlError] = useState('')

  function toggleEvent(val: string) {
    setSelectedEvents(prev =>
      prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val],
    )
  }

  async function handleSubmit() {
    setUrlError('')
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
      setUrlError('Enter a valid URL starting with http:// or https://')
      return
    }
    if (selectedEvents.length === 0) {
      setUrlError('Select at least one event')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), events: selectedEvents }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUrlError(data.error ?? 'Failed to create webhook')
        return
      }
      onAdded(data.webhook)
      setUrl('')
      setSelectedEvents([])
      setOpen(false)
    } catch {
      setUrlError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Webhook
      </Button>
    )
  }

  return (
    <Card className="p-4 space-y-4">
      <p className="font-semibold text-sm">New Webhook Endpoint</p>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Endpoint URL</label>
        <Input
          placeholder="https://your-server.com/webhook"
          value={url}
          onChange={e => { setUrl(e.target.value); setUrlError('') }}
        />
        {urlError && <p className="text-xs text-destructive mt-1">{urlError}</p>}
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-2 block">Events to receive</label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.filter(ev => !isRe || !ev.dealerOnly).map(ev => (
            <button
              key={ev.value}
              type="button"
              onClick={() => toggleEvent(ev.value)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                selectedEvents.includes(ev.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {ev.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setUrlError('') }}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Create Webhook'}
        </Button>
      </div>
    </Card>
  )
}

export default function WebhooksClient({ initialWebhooks, isRe = false }: { initialWebhooks: OrgWebhook[]; isRe?: boolean }) {
  const [webhooks, setWebhooks] = useState<OrgWebhook[]>(initialWebhooks)
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  function handleAdded(hook: OrgWebhook & { secret: string }) {
    setWebhooks(prev => [hook, ...prev])
    setNewSecret({ id: hook.id, secret: hook.secret })
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/settings/webhooks?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setWebhooks(prev => prev.filter(w => w.id !== id))
        if (newSecret?.id === id) setNewSecret(null)
      }
    } catch {
      // Non-fatal
    } finally {
      setDeleting(null)
    }
  }

  const eventLabel = (val: string) =>
    ALL_EVENTS.find(e => e.value === val)?.label ?? val

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Webhooks let you receive real-time notifications when key events happen in your CRM. Each request is signed with HMAC-SHA256 so you can verify it came from DealerWyze.
        </p>
      </div>

      <AddWebhookForm onAdded={handleAdded} isRe={isRe} />

      {newSecret && (
        <SecretBox secret={newSecret.secret} />
      )}

      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Webhook className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No webhooks yet. Add one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(hook => (
            <Card key={hook.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={hook.active ? 'default' : 'secondary'} className="text-[10px]">
                      {hook.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(hook.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-mono break-all text-foreground">{hook.url}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hook.events.map(ev => (
                      <Badge key={ev} variant="outline" className="text-[10px]">
                        {eventLabel(ev)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deleting === hook.id}
                  onClick={() => handleDelete(hook.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
