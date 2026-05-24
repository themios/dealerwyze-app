'use client'

import { useState, useCallback } from 'react'
import { useVertical } from '@/hooks/useVertical'
import { useRouter } from 'next/navigation'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Loader2, Sparkles, ExternalLink, MessageSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

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

// ─── Default templates per trigger × vertical ──────────────────────────────

type TriggerKey = 'post_sale' | 'birthday' | 'anniversary' | 'service_due' | 'referral_thankyou'
type Channel = 'sms' | 'email'

interface TemplateOption {
  label: string
  channel: Channel
  subject?: string
  body: string
}

type VerticalKey = 'dealer' | 'real_estate'

const TEMPLATES: Record<TriggerKey, Record<VerticalKey, TemplateOption[]>> = {
  post_sale: {
    dealer: [
      {
        label: 'SMS – Thank You',
        channel: 'sms',
        body: `Hi {firstName}, congratulations on your new vehicle! It was a pleasure working with you. Reach out anytime if you need anything. - {businessName}`,
      },
      {
        label: 'Email – Congratulations',
        channel: 'email',
        subject: 'Thank you for your purchase, {firstName}!',
        body: `Hi {firstName},

Congratulations and thank you for choosing {businessName}! It was a real pleasure working with you.

We want to make sure you're completely happy with your purchase. If you have any questions or need anything at all, don't hesitate to call or stop by.

We truly appreciate your business and look forward to serving you again.

Warmly,
{businessName}`,
      },
    ],
    real_estate: [
      {
        label: 'SMS – Congratulations',
        channel: 'sms',
        body: `Hi {firstName}, congratulations on your new home! It was a privilege guiding you through this journey. Don't hesitate to reach out for anything. - {businessName}`,
      },
      {
        label: 'Email – Welcome Home',
        channel: 'email',
        subject: 'Congratulations on your new home, {firstName}!',
        body: `Hi {firstName},

Congratulations on closing on your new home! It has been such a privilege working with you throughout this process.

Whether you need contractor referrals, neighborhood advice, or simply have questions down the road, I'm always here to help.

Thank you so much for trusting us with such an important milestone.

Warmly,
{businessName}`,
      },
    ],
  },
  birthday: {
    dealer: [
      {
        label: 'SMS – Happy Birthday',
        channel: 'sms',
        body: `Happy Birthday {firstName}! 🎂 Wishing you a wonderful day. From all of us at {businessName}, thank you for being such a valued customer!`,
      },
      {
        label: 'Email – Birthday Greeting',
        channel: 'email',
        subject: 'Happy Birthday, {firstName}! 🎂',
        body: `Hi {firstName},

Wishing you a very happy birthday from the entire team at {businessName}!

Thank you for being such a valued customer. We hope your special day is filled with joy.

Many happy returns,
{businessName}`,
      },
    ],
    real_estate: [
      {
        label: 'SMS – Happy Birthday',
        channel: 'sms',
        body: `Happy Birthday {firstName}! 🎂 Wishing you a wonderful day. From all of us at {businessName}, thank you for being such a valued client!`,
      },
      {
        label: 'Email – Birthday Greeting',
        channel: 'email',
        subject: 'Happy Birthday, {firstName}! 🎂',
        body: `Hi {firstName},

Wishing you a very happy birthday from the entire team at {businessName}!

Thank you for being such a valued client. We hope your special day is filled with joy.

Many happy returns,
{businessName}`,
      },
    ],
  },
  anniversary: {
    dealer: [
      {
        label: 'SMS – Sale Anniversary',
        channel: 'sms',
        body: `Hi {firstName}, one year ago today you drove home in your new vehicle. We hope you're still loving it! - {businessName}`,
      },
      {
        label: 'Email – Anniversary',
        channel: 'email',
        subject: 'One year already, {firstName}!',
        body: `Hi {firstName},

It's hard to believe it's already been a year since you drove home in your vehicle! We hope you're still loving every mile.

We're grateful for your business and would love to hear how things are going. Swing by anytime, and don't forget we're here for any service needs too.

Thanks again,
{businessName}`,
      },
    ],
    real_estate: [
      {
        label: 'SMS – Home Anniversary',
        channel: 'sms',
        body: `Hi {firstName}, one year ago today you got the keys to your new home. We hope you're loving every moment in it! - {businessName}`,
      },
      {
        label: 'Email – Home Anniversary',
        channel: 'email',
        subject: 'One year in your home, {firstName}!',
        body: `Hi {firstName},

Can you believe it's already been a year since you moved into your home? We hope you've settled in beautifully and are loving every day there.

If you ever need anything — a referral, a market update, or just a chat — we're always just a call away.

Warmly,
{businessName}`,
      },
    ],
  },
  service_due: {
    dealer: [
      {
        label: 'SMS – Service Reminder',
        channel: 'sms',
        body: `Hi {firstName}, just a friendly reminder that it may be time to service your vehicle. Give us a call or stop by anytime! - {businessName}`,
      },
      {
        label: 'Email – Service Reminder',
        channel: 'email',
        subject: 'Time for a quick service check, {firstName}',
        body: `Hi {firstName},

We wanted to give you a friendly heads-up that your vehicle may be due for a routine service check.

Regular maintenance keeps your car running smoothly and helps protect your investment. We make it quick and easy — no appointment required for most services.

Give us a call or stop by anytime.

{businessName}`,
      },
    ],
    real_estate: [
      {
        label: 'SMS – Home Maintenance Reminder',
        channel: 'sms',
        body: `Hi {firstName}, a friendly reminder to schedule seasonal home maintenance. Small upkeep now protects your biggest investment! - {businessName}`,
      },
      {
        label: 'Email – Seasonal Maintenance',
        channel: 'email',
        subject: 'Seasonal home maintenance reminder, {firstName}',
        body: `Hi {firstName},

Just a friendly reminder to check off those seasonal home maintenance tasks — HVAC filters, gutters, smoke detectors, and a general walkthrough go a long way.

Staying on top of small things protects your investment and keeps everything running smoothly.

If you need contractor referrals or have questions, I'm always happy to help.

{businessName}`,
      },
    ],
  },
  referral_thankyou: {
    dealer: [
      {
        label: 'SMS – Referral Thank You',
        channel: 'sms',
        body: `Hi {firstName}, thank you so much for sending someone our way! Your trust and referrals are the greatest compliment. We truly appreciate it! - {businessName}`,
      },
      {
        label: 'Email – Referral Thank You',
        channel: 'email',
        subject: 'Thank you for the referral, {firstName}!',
        body: `Hi {firstName},

We just wanted to say a huge thank you for referring someone to us. Your trust means everything, and it's the highest compliment we can receive.

We'll take great care of them, just as we have with you.

With gratitude,
{businessName}`,
      },
    ],
    real_estate: [
      {
        label: 'SMS – Referral Thank You',
        channel: 'sms',
        body: `Hi {firstName}, thank you so much for the referral! Your confidence in us means the world. We'll make sure to take great care of them. - {businessName}`,
      },
      {
        label: 'Email – Referral Thank You',
        channel: 'email',
        subject: 'Thank you for the referral, {firstName}!',
        body: `Hi {firstName},

Thank you so much for trusting us with your referral. There is truly no greater compliment than a recommendation from a past client.

We will take excellent care of them every step of the way.

With sincere gratitude,
{businessName}`,
      },
    ],
  },
}

// ─── Trigger config ─────────────────────────────────────────────────────────

const TRIGGER_INFO: {
  key: keyof RetentionSettings
  triggerKey: TriggerKey
  label: string | ((isRE: boolean) => string)
  description: (isRE: boolean) => string
  offsetKey?: keyof RetentionSettings
  offsetLabel?: string
  offsetUnit?: string
}[] = [
  {
    key: 'post_sale_sequence_id',
    triggerKey: 'post_sale',
    label: 'Post-Sale Thank You',
    description: isRE => isRE ? 'Sent automatically after a deal closes.' : 'Sent automatically after a customer buys a car.',
    offsetKey: 'post_sale_delay_days',
    offsetLabel: 'Days after sale',
    offsetUnit: 'days',
  },
  {
    key: 'birthday_sequence_id',
    triggerKey: 'birthday',
    label: 'Birthday',
    description: () => "Sent on (or before) the customer's birthday.",
    offsetKey: 'birthday_days_before',
    offsetLabel: 'Days before birthday',
    offsetUnit: 'days',
  },
  {
    key: 'anniversary_sequence_id',
    triggerKey: 'anniversary',
    label: 'Sale Anniversary',
    description: isRE => isRE ? 'Sent each year on the anniversary of their closing.' : 'Sent each year on the anniversary of their purchase.',
    offsetKey: 'anniversary_days_before',
    offsetLabel: 'Days before anniversary',
    offsetUnit: 'days',
  },
  {
    key: 'service_due_sequence_id',
    triggerKey: 'service_due',
    label: isRE => isRE ? 'Home Maintenance Reminder' : 'Service Reminder',
    description: isRE => isRE ? 'Sent to remind clients about seasonal home maintenance.' : 'Sent when a customer is due for service.',
    offsetKey: 'service_due_days',
    offsetLabel: 'Days since last service',
    offsetUnit: 'days',
  },
  {
    key: 'referral_thankyou_sequence_id',
    triggerKey: 'referral_thankyou',
    label: 'Referral Thank You',
    description: isRE => isRE ? 'Sent to clients who refer someone new.' : 'Sent to customers who refer someone new.',
  },
]

// Make label work as string or fn
function resolveLabel(
  t: typeof TRIGGER_INFO[number],
  isRE: boolean
): string {
  return typeof t.label === 'function' ? (t.label as (isRE: boolean) => string)(isRE) : t.label as string
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RetentionSettingsClient({ initialSettings, sequences: initialSequences, postgridApiKey }: Props) {
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'
  const verticalKey: VerticalKey = isRE ? 'real_estate' : 'dealer'
  const router = useRouter()

  const initialPostgridConfigured = !!postgridApiKey
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences)
  const [saving, setSaving] = useState(false)
  const [postgridConfigured, setPostgridConfigured] = useState(initialPostgridConfigured)
  const [pgKey, setPgKey] = useState(postgridApiKey ? '••••••••' : '')
  const [pgKeyEditing, setPgKeyEditing] = useState(false)
  const [pgKeySaving, setPgKeySaving] = useState(false)
  const [pgKeyError, setPgKeyError]   = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Which trigger has its template picker open
  const [openPicker, setOpenPicker] = useState<TriggerKey | null>(null)
  // Seeding state per trigger
  const [seeding, setSeeding] = useState<Partial<Record<TriggerKey, boolean>>>({})

  async function savePostgridKey() {
    if (!pgKeyEditing || pgKey === '••••••••') { setPgKeyEditing(true); return }
    setPgKeySaving(true)
    setPgKeyError(null)
    try {
      await apiFetch('/api/settings/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postgrid_api_key: pgKey.trim() || null }) })
      setPgKeyEditing(false)
      const hasKey = !!pgKey.trim()
      setPgKey(hasKey ? '••••••••' : '')
      setPostgridConfigured(hasKey)
      router.refresh()
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
  const initialFormSnapshot = JSON.stringify({
    birthday_sequence_id: initialSettings?.birthday_sequence_id ?? NONE,
    anniversary_sequence_id: initialSettings?.anniversary_sequence_id ?? NONE,
    service_due_sequence_id: initialSettings?.service_due_sequence_id ?? NONE,
    post_sale_sequence_id: initialSettings?.post_sale_sequence_id ?? NONE,
    referral_thankyou_sequence_id: initialSettings?.referral_thankyou_sequence_id ?? NONE,
    birthday_days_before: String(initialSettings?.birthday_days_before ?? 0),
    anniversary_days_before: String(initialSettings?.anniversary_days_before ?? 0),
    service_due_days: String(initialSettings?.service_due_days ?? 60),
    post_sale_delay_days: String(initialSettings?.post_sale_delay_days ?? 7),
    card_delivery_method: initialSettings?.card_delivery_method ?? 'print_and_mail',
    postgridConfigured: initialPostgridConfigured,
  })
  const isDirty = JSON.stringify({ ...form, postgridConfigured }) !== initialFormSnapshot
  useUnsavedChangesGuard(isDirty)

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
    setSaveError(null)
  }

  /** Create a sequence from a template and auto-link it to this trigger */
  const seedTemplate = useCallback(async (
    triggerKey: TriggerKey,
    formKey: keyof RetentionSettings,
    tmpl: TemplateOption,
  ) => {
    setSeeding(s => ({ ...s, [triggerKey]: true }))
    try {
      const res = await fetch('/api/retention/seed-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: triggerKey,
          channel:      tmpl.channel,
          subject:      tmpl.subject,
          body:         tmpl.body,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Failed to create template')
      }
      const { sequence_id, sequence_name, channel } = await res.json() as {
        sequence_id: string
        sequence_name: string
        channel: string
      }
      // Add to local sequences list so the dropdown renders immediately
      setSequences(prev => [...prev, { id: sequence_id, name: sequence_name, channel }])
      update(formKey as string, sequence_id)
      setOpenPicker(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create template')
    } finally {
      setSeeding(s => ({ ...s, [triggerKey]: false }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const payload: Record<string, unknown> = {
        card_delivery_method: form.card_delivery_method,
      }
      for (const t of TRIGGER_INFO) {
        payload[t.key] = form[t.key as keyof typeof form] === NONE ? null : form[t.key as keyof typeof form]
        if (t.offsetKey) payload[t.offsetKey] = parseInt(form[t.offsetKey as keyof typeof form] as string) || 0
      }
      const res = await fetch('/api/retention/settings', { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) { setSaveError('Save failed. Please try again.'); return }
      setSaved(true)
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

      {/* Template variables hint */}
      <div className="rounded-lg bg-muted/50 border px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wide mb-1.5">Available variables in templates</p>
        <div className="flex flex-wrap gap-1.5">
          {['{firstName}', '{businessName}'].map(v => (
            <code key={v} className="bg-background border rounded px-1.5 py-0.5 text-xs font-mono">{v}</code>
          ))}
        </div>
      </div>

      {/* Trigger cards */}
      {TRIGGER_INFO.map(t => {
        const seqId     = form[t.key as keyof typeof form] as string
        const linkedSeq = sequences.find(s => s.id === seqId)
        const isEmail   = linkedSeq?.channel === 'email'
        const isPickerOpen = openPicker === t.triggerKey
        const isSeedingThis = !!seeding[t.triggerKey]
        const templates = TEMPLATES[t.triggerKey][verticalKey]
        const label = resolveLabel(t, isRE)

        return (
          <Card key={t.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{label}</CardTitle>
                {seqId !== NONE && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    {isEmail
                      ? <><Mail className="h-3 w-3" />Email</>
                      : <><MessageSquare className="h-3 w-3" />SMS</>}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t.description(isRE)}</p>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Sequence selector */}
              <div className="space-y-1.5">
                <Label className="text-sm">Linked sequence</Label>
                <Select value={seqId} onValueChange={v => update(t.key, v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not configured" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not configured</SelectItem>
                    <SelectItem value="__group_email__" disabled className="text-xs text-muted-foreground font-medium">-- Email --</SelectItem>
                    {seqOptions('email')}
                    <SelectItem value="__group_sms__" disabled className="text-xs text-muted-foreground font-medium">-- SMS --</SelectItem>
                    {seqOptions('sms')}
                  </SelectContent>
                </Select>
              </div>

              {/* Edit sequence link if linked */}
              {seqId !== NONE && linkedSeq && (
                <a
                  href={`/settings/sequences/${seqId}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Edit full sequence: {linkedSeq.name}
                </a>
              )}

              {/* Offset config */}
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

              {/* Default template picker */}
              <div className="border-t pt-3">
                <button
                  type="button"
                  onClick={() => setOpenPicker(isPickerOpen ? null : t.triggerKey)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
                  {seqId === NONE ? 'Start from a default template' : 'Use a different template'}
                  {isPickerOpen
                    ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                    : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                </button>

                {isPickerOpen && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Clicking a template creates a new sequence with that message and links it automatically.
                      You can edit the full sequence afterwards.
                    </p>
                    <div className="grid gap-2">
                      {templates.map((tmpl, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={isSeedingThis}
                          onClick={() => seedTemplate(t.triggerKey, t.key, tmpl)}
                          className={cn(
                            'text-left rounded-lg border p-3 space-y-1.5 transition-colors',
                            'hover:border-primary/60 hover:bg-primary/5',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {tmpl.channel === 'sms'
                              ? <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              : <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-xs font-semibold">{tmpl.label}</span>
                            {isSeedingThis && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                          </div>
                          {tmpl.subject && (
                            <p className="text-[11px] text-muted-foreground font-medium">
                              Subject: {tmpl.subject}
                            </p>
                          )}
                          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed line-clamp-4">
                            {tmpl.body}
                          </pre>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base">
        {saving ? 'Saving...' : 'Save Retention Settings'}
      </Button>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
      {saved ? <p className="text-sm text-green-700">Retention settings saved.</p> : null}
    </div>
  )
}
