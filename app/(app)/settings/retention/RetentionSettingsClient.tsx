'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Sequence { id: string; name: string; channel: string }

interface RetentionSettings {
  birthday_sequence_id?:          string | null
  anniversary_sequence_id?:       string | null
  service_due_sequence_id?:       string | null
  post_sale_sequence_id?:         string | null
  referral_thankyou_sequence_id?: string | null
  birthday_days_before?:          number
  anniversary_days_before?:       number
  service_due_days?:              number
  post_sale_delay_days?:          number
  card_delivery_method?:          string
}

interface Props {
  initialSettings:    RetentionSettings | null
  sequences:          Sequence[]
  postgridApiKey?:    string | null
}

const NONE = '__none__'

const TRIGGER_INFO: { key: keyof RetentionSettings; label: string; description: string; offsetKey?: keyof RetentionSettings; offsetLabel?: string; offsetUnit?: string }[] = [
  {
    key: 'post_sale_sequence_id',
    label: 'Post-Sale Thank You',
    description: 'Sent automatically after a customer buys a car.',
    offsetKey: 'post_sale_delay_days',
    offsetLabel: 'Days after sale',
    offsetUnit: 'days',
  },
  {
    key: 'birthday_sequence_id',
    label: 'Birthday',
    description: 'Sent on (or before) the customer\'s birthday.',
    offsetKey: 'birthday_days_before',
    offsetLabel: 'Days before birthday',
    offsetUnit: 'days',
  },
  {
    key: 'anniversary_sequence_id',
    label: 'Sale Anniversary',
    description: 'Sent each year on the anniversary of their purchase.',
    offsetKey: 'anniversary_days_before',
    offsetLabel: 'Days before anniversary',
    offsetUnit: 'days',
  },
  {
    key: 'service_due_sequence_id',
    label: 'Service Reminder',
    description: 'Sent when a customer is due for service.',
    offsetKey: 'service_due_days',
    offsetLabel: 'Days since last service',
    offsetUnit: 'days',
  },
  {
    key: 'referral_thankyou_sequence_id',
    label: 'Referral Thank You',
    description: 'Sent to customers who refer someone new.',
  },
]

export default function RetentionSettingsClient({ initialSettings, sequences, postgridApiKey }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [pgKey, setPgKey] = useState(postgridApiKey ? '••••••••' : '')
  const [pgKeyEditing, setPgKeyEditing] = useState(false)
  const [pgKeySaving, setPgKeySaving] = useState(false)
  const [pgKeyError, setPgKeyError]   = useState<string | null>(null)

  async function savePostgridKey() {
    if (!pgKeyEditing || pgKey === '••••••••') { setPgKeyEditing(true); return }
    setPgKeySaving(true)
    setPgKeyError(null)
    try {
      await apiFetch('/api/settings/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postgrid_api_key: pgKey.trim() || null }) })
      setPgKeyEditing(false)
      setPgKey(pgKey.trim() ? '••••••••' : '')
    } catch (err) {
      setPgKeyError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setPgKeySaving(false)
    }
  }

  function getInitial(key: keyof RetentionSettings, fallback: string | number): string | number {
    const v = initialSettings?.[key]
    return v != null ? v : fallback
  }

  const [form, setForm] = useState({
    birthday_sequence_id:          (getInitial('birthday_sequence_id', NONE) as string),
    anniversary_sequence_id:       (getInitial('anniversary_sequence_id', NONE) as string),
    service_due_sequence_id:       (getInitial('service_due_sequence_id', NONE) as string),
    post_sale_sequence_id:         (getInitial('post_sale_sequence_id', NONE) as string),
    referral_thankyou_sequence_id: (getInitial('referral_thankyou_sequence_id', NONE) as string),
    birthday_days_before:          String(getInitial('birthday_days_before', 0)),
    anniversary_days_before:       String(getInitial('anniversary_days_before', 0)),
    service_due_days:              String(getInitial('service_due_days', 60)),
    post_sale_delay_days:          String(getInitial('post_sale_delay_days', 7)),
    card_delivery_method:          (getInitial('card_delivery_method', 'print_and_mail') as string),
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        card_delivery_method: form.card_delivery_method,
      }
      for (const t of TRIGGER_INFO) {
        payload[t.key] = form[t.key as keyof typeof form] === NONE ? null : form[t.key as keyof typeof form]
        if (t.offsetKey) payload[t.offsetKey] = parseInt(form[t.offsetKey as keyof typeof form] as string) || 0
      }

      const res = await fetch('/api/retention/settings', { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) { alert('Save failed. Please try again.'); return }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const emailSeqs = sequences.filter(s => s.channel === 'email')
  const smsSeqs   = sequences.filter(s => s.channel === 'sms')

  function seqOptions(channel: 'email' | 'sms') {
    const list = channel === 'email' ? emailSeqs : smsSeqs
    return list.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
  }

  return (
    <div className="space-y-6">
      {/* Card Delivery Method */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Card Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-sm text-muted-foreground">
            How should physical cards be sent?
          </Label>
          <Select value={form.card_delivery_method} onValueChange={v => update('card_delivery_method', v)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="print_and_mail">Print and Mail (receptionist prints weekly batch)</SelectItem>
              <SelectItem value="postgrid">PostGrid (automated mailing - requires API key)</SelectItem>
            </SelectContent>
          </Select>
          {form.card_delivery_method === 'postgrid' && (
            <div className="space-y-2 pt-1">
              <Label className="text-sm">PostGrid API Key</Label>
              <div className="flex gap-2">
                <Input
                  type={pgKeyEditing ? 'text' : 'password'}
                  value={pgKey}
                  onChange={e => setPgKey(e.target.value)}
                  placeholder="live_sk_..."
                  readOnly={!pgKeyEditing}
                  className="h-11 flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={savePostgridKey}
                  disabled={pgKeySaving}
                  className="h-11 px-4 shrink-0"
                >
                  {pgKeySaving ? 'Saving...' : pgKeyEditing ? 'Save Key' : 'Edit'}
                </Button>
              </div>
              {pgKeyError && <p className="text-sm text-destructive">{pgKeyError}</p>}
              <p className="text-xs text-muted-foreground">
                Your PostGrid live secret key. Cards will be mailed automatically each Monday.
              </p>
            </div>
          )}
          {form.card_delivery_method === 'print_and_mail' && (
            <p className="text-xs text-muted-foreground">
              Every Monday, a batch print file is generated and a task is created for your receptionist.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Trigger Sequences */}
      {TRIGGER_INFO.map(t => {
        const seqId = form[t.key as keyof typeof form] as string
        const isEmail = sequences.find(s => s.id === seqId)?.channel === 'email'

        return (
          <Card key={t.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t.label}</CardTitle>
                {seqId !== NONE && (
                  <Badge variant="secondary" className="text-xs">
                    {isEmail ? 'Email' : 'SMS'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Sequence</Label>
                <Select value={seqId} onValueChange={v => update(t.key, v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not configured" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not configured</SelectItem>
                    <SelectItem value="" disabled className="text-xs text-muted-foreground font-medium">-- Email --</SelectItem>
                    {seqOptions('email')}
                    <SelectItem value="" disabled className="text-xs text-muted-foreground font-medium">-- SMS --</SelectItem>
                    {seqOptions('sms')}
                  </SelectContent>
                </Select>
              </div>
              {t.offsetKey && seqId !== NONE && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{t.offsetLabel}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={form[t.offsetKey as keyof typeof form] as string}
                      onChange={e => update(t.offsetKey!, e.target.value)}
                      className="h-11 w-24"
                    />
                    <span className="text-sm text-muted-foreground">{t.offsetUnit}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base">
        {saving ? 'Saving...' : 'Save Retention Settings'}
      </Button>
    </div>
  )
}
