// app/(app)/settings/pulse/PulseSettingsClient.tsx
'use client'

import { useState, useEffect } from 'react'
import { useVertical } from '@/hooks/useVertical'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Star, Heart, ExternalLink, CheckCircle2, AlertCircle, MessageSquare, RotateCcw } from 'lucide-react'

interface OutreachSettings {
  // Pulse
  pulse_enabled: boolean
  pulse_auto_send_on_sold: boolean
  pulse_send_day30: boolean
  pulse_send_day180: boolean
  pulse_sms_template: string | null
  // Google Reviews
  google_review_url: string
  review_request_enabled: boolean
  review_request_delay_days: number
}

const DEFAULTS: OutreachSettings = {
  pulse_enabled: false, pulse_auto_send_on_sold: true,
  pulse_send_day30: true, pulse_send_day180: false,
  pulse_sms_template: null,
  google_review_url: '', review_request_enabled: false, review_request_delay_days: 0,
}

const SYSTEM_DEFAULT_SMS = `Hi {firstName}! Thank you for your recent purchase at {businessName}. Your experience matters to us. Please take a moment to share your feedback: {surveyLink}`
const SYSTEM_DEFAULT_SMS_RE = `Hi {firstName}! Thank you for letting us be part of your journey. Your experience matters to us. Please take a moment to share your feedback: {surveyLink}`

const VARIABLES = ['{firstName}', '{businessName}', '{surveyLink}']

export default function PulseSettingsClient() {
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'
  const systemDefault = isRE ? SYSTEM_DEFAULT_SMS_RE : SYSTEM_DEFAULT_SMS

  const [settings, setSettings] = useState<OutreachSettings>(DEFAULTS)
  const [saving, setSaving]     = useState(false)
  const [status, setStatus]     = useState<'idle' | 'saved' | 'error'>('idle')
  // Local textarea state — null means "use system default"
  const [smsTemplate, setSmsTemplate] = useState<string>('')
  const [smsTemplateEnabled, setSmsTemplateEnabled] = useState(false)

  useEffect(() => {
    fetch('/api/settings/pulse')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setSettings({
            pulse_enabled:             d.pulse_enabled             ?? false,
            pulse_auto_send_on_sold:   d.pulse_auto_send_on_sold   ?? true,
            pulse_send_day30:          d.pulse_send_day30           ?? true,
            pulse_send_day180:         d.pulse_send_day180          ?? false,
            pulse_sms_template:        d.pulse_sms_template         ?? null,
            google_review_url:         d.google_review_url          ?? '',
            review_request_enabled:    d.review_request_enabled     ?? false,
            review_request_delay_days: d.review_request_delay_days  ?? 0,
          })
          if (d.pulse_sms_template) {
            setSmsTemplate(d.pulse_sms_template)
            setSmsTemplateEnabled(true)
          }
        }
      })
  }, [])

  function set<K extends keyof OutreachSettings>(key: K, val: OutreachSettings[K]) {
    setSettings(p => ({ ...p, [key]: val }))
  }

  function resetToDefault() {
    setSmsTemplate(systemDefault)
  }

  async function save() {
    const delayDays = Number(settings.review_request_delay_days)
    if (isNaN(delayDays) || delayDays < 0 || delayDays > 365) {
      setStatus('error')
      return
    }
    setSaving(true)
    setStatus('idle')
    const templateToSave = smsTemplateEnabled && smsTemplate.trim() ? smsTemplate.trim() : null
    const res = await fetch('/api/settings/pulse', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...settings,
        review_request_delay_days: delayDays,
        pulse_sms_template: templateToSave,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } else {
      setStatus('error')
    }
  }

  const delayStr = String(settings.review_request_delay_days)

  // Live preview of the SMS
  const previewSms = (smsTemplateEnabled && smsTemplate.trim() ? smsTemplate : systemDefault)
    .replace('{firstName}', 'Alex')
    .replace('{businessName}', isRE ? 'Sunrise Realty' : 'Main Street Motors')
    .replace('{surveyLink}', 'dealerwyze.com/pulse/abc123')

  return (
    <div className="px-4 py-6 space-y-6 max-w-lg">

      {/* Google Reviews section */}
      <div className="bg-card rounded-xl border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          <h2 className="font-semibold text-base">Google Review Requests</h2>
        </div>

        {/* Review URL hint */}
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">How to find your Google review link</p>
          <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Go to <strong>Google Business Profile</strong> (business.google.com)</li>
            <li>Select your location and click <strong>Get more reviews</strong></li>
            <li>Copy the short link starting with <code className="bg-blue-100 dark:bg-blue-900 rounded px-1">g.page/r/</code></li>
          </ol>
        </div>

        {/* Review URL input */}
        <div className="space-y-1.5">
          <Label>Your Google Review Link</Label>
          <div className="flex gap-2">
            <Input
              value={settings.google_review_url}
              onChange={e => set('google_review_url', e.target.value)}
              placeholder="https://g.page/r/your-business/review"
              className="h-11 flex-1"
            />
            {settings.google_review_url && (
              <a href={settings.google_review_url} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" className="h-11 px-3" title="Test link">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Auto-send after sale</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRE ? 'Send a review request when you close a deal' : 'Send a review request when you mark a vehicle sold'}
            </p>
          </div>
          <Switch
            checked={settings.review_request_enabled}
            onCheckedChange={v => set('review_request_enabled', v)}
          />
        </div>

        {/* Delay days */}
        {settings.review_request_enabled && (
          <div className="space-y-1.5 border-t pt-4">
            <Label>Send after how many days?</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={365}
                value={delayStr}
                onChange={e => set('review_request_delay_days', Number(e.target.value))}
                className="h-11 w-28"
              />
              <p className="text-sm text-muted-foreground">
                {delayStr === '0' || delayStr === ''
                  ? 'Sends immediately when the sale is saved'
                  : `Sends ${delayStr} day${parseInt(delayStr) === 1 ? '' : 's'} after the sale`}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isRE
                ? 'Day 0 = immediately after closing. Day 3–7 = once the client has settled in.'
                : 'Day 0 = immediately (excitement is highest right after the sale). Day 3–7 = after they have driven the car.'}
            </p>
          </div>
        )}
      </div>

      {/* Customer Pulse section */}
      <div className="bg-card rounded-xl border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-base">{isRE ? 'Client' : 'Customer'} Pulse Surveys</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable {isRE ? 'Client' : 'Customer'} Pulse</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRE
                ? 'Send satisfaction surveys after every closing and track your team scores'
                : 'Send satisfaction surveys after every sale and track your team scores'}
            </p>
          </div>
          <Switch
            checked={settings.pulse_enabled}
            onCheckedChange={v => set('pulse_enabled', v)}
          />
        </div>

        {settings.pulse_enabled && (
          <div className="border-t pt-4 space-y-4">
            {/* Auto-send triggers */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-Send Triggers</p>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">On sale (immediately)</Label>
                <p className="text-xs text-muted-foreground">
                  {isRE ? 'Survey sent when you close a deal' : 'Survey sent when you mark a vehicle sold'}
                </p>
              </div>
              <Switch
                checked={settings.pulse_auto_send_on_sold}
                onCheckedChange={v => set('pulse_auto_send_on_sold', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">30-day follow-up</Label>
                <p className="text-xs text-muted-foreground">Second survey 30 days after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day30}
                onCheckedChange={v => set('pulse_send_day30', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">6-month follow-up</Label>
                <p className="text-xs text-muted-foreground">Third survey 6 months after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day180}
                onCheckedChange={v => set('pulse_send_day180', v)}
              />
            </div>

            {/* Invitation message customisation */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Survey invitation message</p>
              </div>
              <p className="text-xs text-muted-foreground">
                This is the SMS {isRE ? 'clients' : 'customers'} receive when a pulse survey is triggered.
                Customise it to match your voice.
              </p>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Use a custom message</Label>
                <Switch
                  checked={smsTemplateEnabled}
                  onCheckedChange={v => {
                    setSmsTemplateEnabled(v)
                    if (v && !smsTemplate.trim()) setSmsTemplate(systemDefault)
                  }}
                />
              </div>

              {smsTemplateEnabled && (
                <div className="space-y-2">
                  <Textarea
                    value={smsTemplate}
                    onChange={e => setSmsTemplate(e.target.value)}
                    rows={4}
                    maxLength={320}
                    className="text-sm resize-none"
                    placeholder={systemDefault}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {VARIABLES.map(v => (
                        <code
                          key={v}
                          className="bg-muted border rounded px-1.5 py-0.5 text-[11px] font-mono cursor-pointer hover:bg-accent"
                          title="Click to insert"
                          onClick={() => setSmsTemplate(t => t + v)}
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={resetToDefault}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset to default
                    </button>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground tabular-nums">
                    {smsTemplate.length} / 320
                  </div>
                </div>
              )}

              {/* Live preview */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview — as {isRE ? 'client' : 'customer'} receives it
                </p>
                <p className="text-xs text-foreground leading-relaxed">{previewSms}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="h-11 px-6">
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        {status === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Check your inputs and try again
          </span>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-sm font-semibold">What gets sent</p>
        <p className="text-xs text-muted-foreground">
          When triggered, the {isRE ? 'client' : 'customer'} receives a text (if they have a phone on file and have not opted out).
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong>Review request</strong> — short message with your Google review link</li>
          <li><strong>Pulse survey</strong> — quick satisfaction survey link (anonymous)</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          Review requests deduplicate at 60 days. Pulse surveys deduplicate at 7 days per trigger type.
        </p>
      </div>
    </div>
  )
}
