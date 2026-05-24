'use client'

import { useMemo, useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import SaveBar from '@/components/admin/settings/SaveBar'

type PlatformNotificationConfig = {
  owner_email: string
  telegram_chat_id: string
  alert_on_signup: boolean
  alert_on_cancellation: boolean
  alert_on_payment_failure: boolean
  alert_on_connector_failure: boolean
  daily_digest_enabled: boolean
  daily_digest_hour_utc: number
  weekly_briefing_enabled: boolean
  weekly_briefing_day: number
  updated_at: string | null
}

type NotificationsClientProps = {
  initialData: Partial<{
    owner_email: string | null
    telegram_chat_id: string | null
    alert_on_signup: boolean | null
    alert_on_cancellation: boolean | null
    alert_on_payment_failure: boolean | null
    alert_on_connector_failure: boolean | null
    daily_digest_enabled: boolean | null
    daily_digest_hour_utc: number | null
    weekly_briefing_enabled: boolean | null
    weekly_briefing_day: number | null
    updated_at: string | null
  }>
}

type FieldErrors = Partial<Record<keyof Omit<PlatformNotificationConfig, 'updated_at'>, string>>

const WEEK_DAYS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

function getInitialFormState(input: NotificationsClientProps['initialData']): PlatformNotificationConfig {
  return {
    owner_email: input.owner_email ?? '',
    telegram_chat_id: input.telegram_chat_id ?? '',
    alert_on_signup: input.alert_on_signup ?? true,
    alert_on_cancellation: input.alert_on_cancellation ?? true,
    alert_on_payment_failure: input.alert_on_payment_failure ?? true,
    alert_on_connector_failure: input.alert_on_connector_failure ?? true,
    daily_digest_enabled: input.daily_digest_enabled ?? true,
    daily_digest_hour_utc: input.daily_digest_hour_utc ?? 16,
    weekly_briefing_enabled: input.weekly_briefing_enabled ?? true,
    weekly_briefing_day: input.weekly_briefing_day ?? 1,
    updated_at: input.updated_at ?? null,
  }
}

export default function NotificationsClient({ initialData }: NotificationsClientProps) {
  const initialForm = useMemo(() => getInitialFormState(initialData), [initialData])
  const [baseForm, setBaseForm] = useState(initialForm)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [savedAt, setSavedAt] = useState<string | null>(initialForm.updated_at)

  const dirty = useMemo(() => {
    return (
      form.owner_email !== baseForm.owner_email ||
      form.telegram_chat_id !== baseForm.telegram_chat_id ||
      form.alert_on_signup !== baseForm.alert_on_signup ||
      form.alert_on_cancellation !== baseForm.alert_on_cancellation ||
      form.alert_on_payment_failure !== baseForm.alert_on_payment_failure ||
      form.alert_on_connector_failure !== baseForm.alert_on_connector_failure ||
      form.daily_digest_enabled !== baseForm.daily_digest_enabled ||
      Number(form.daily_digest_hour_utc) !== Number(baseForm.daily_digest_hour_utc) ||
      form.weekly_briefing_enabled !== baseForm.weekly_briefing_enabled ||
      Number(form.weekly_briefing_day) !== Number(baseForm.weekly_briefing_day)
    )
  }, [form, baseForm])

  async function onSave() {
    setSaving(true)
    setError(null)
    setFieldErrors({})
    try {
      const response = await fetch('/api/admin/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          owner_email: form.owner_email.trim() || null,
          telegram_chat_id: form.telegram_chat_id.trim() || null,
          daily_digest_hour_utc: Number(form.daily_digest_hour_utc),
          weekly_briefing_day: Number(form.weekly_briefing_day),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload?.error === 'validation_failed' && payload?.field) {
          const field = payload.field as keyof Omit<PlatformNotificationConfig, 'updated_at'>
          setFieldErrors({ [field]: payload.message ?? 'Invalid value' })
        }
        setError(payload?.message ?? payload?.error ?? 'Could not save notification settings')
        return
      }

      const updated = getInitialFormState(payload.data ?? {})
      setBaseForm(updated)
      setForm(updated)
      setSavedAt(updated.updated_at ?? new Date().toISOString())
      setError(null)
      setFieldErrors({})
    } catch {
      setError('Could not save notification settings')
    } finally {
      setSaving(false)
    }
  }

  function onCancel() {
    setForm(baseForm)
    setError(null)
    setFieldErrors({})
  }

  function toggleClass(enabled: boolean, danger = false) {
    return `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? (danger ? 'bg-red-500' : 'bg-[#F07018]') : 'bg-white/20'
    }`
  }

  function fieldClass(name: keyof Omit<PlatformNotificationConfig, 'updated_at'>) {
    return `bg-[#07131F] border text-white rounded-lg px-3 py-2 text-sm w-full ${
      fieldErrors[name] ? 'border-red-500' : 'border-[#1B4A8A]/40'
    }`
  }

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Notifications"
        description="Alert routing and digest schedule for platform events."
        updatedAt={savedAt}
      />

      {error ? <p className="text-red-400 text-sm mb-4">{error}</p> : null}

      <form
        onSubmit={event => {
          event.preventDefault()
          void onSave()
        }}
      >
        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 space-y-4">
          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="owner_email">
              Owner Email
            </label>
            <input
              id="owner_email"
              type="text"
              placeholder="Platform owner email"
              value={form.owner_email}
              onChange={event => setForm(prev => ({ ...prev, owner_email: event.target.value }))}
              className={fieldClass('owner_email')}
            />
            {fieldErrors.owner_email ? (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.owner_email}</p>
            ) : null}
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="telegram_chat_id">
              Telegram Chat ID
            </label>
            <input
              id="telegram_chat_id"
              type="text"
              placeholder="Telegram chat ID (e.g. -100123456789)"
              value={form.telegram_chat_id}
              onChange={event => setForm(prev => ({ ...prev, telegram_chat_id: event.target.value }))}
              className={fieldClass('telegram_chat_id')}
            />
            {fieldErrors.telegram_chat_id ? (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.telegram_chat_id}</p>
            ) : null}
          </div>
        </div>

        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 space-y-1 mt-4">
          {[
            {
              key: 'alert_on_signup' as const,
              label: 'New dealer signup',
              description: 'Fires immediately on registration',
            },
            {
              key: 'alert_on_cancellation' as const,
              label: 'Dealer cancellation',
              description: 'Fires on plan cancel or account closure',
            },
            {
              key: 'alert_on_payment_failure' as const,
              label: 'Payment failure',
              description: 'Fires on failed Stripe charge',
            },
            {
              key: 'alert_on_connector_failure' as const,
              label: 'Connector failure',
              description: 'Fires when social token expires or errors',
            },
          ].map((item, index, arr) => (
            <div
              key={item.key}
              className={`flex items-center justify-between py-2 ${
                index < arr.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <div>
                <p className="text-white/70 text-sm">{item.label}</p>
                <p className="text-white/30 text-xs">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm(prev => ({
                    ...prev,
                    [item.key]: !prev[item.key],
                  }))
                }
                className={toggleClass(form[item.key])}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    form[item.key] ? 'right-0.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 mt-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-white/70 text-sm">Daily digest enabled</p>
              <button
                type="button"
                onClick={() =>
                  setForm(prev => ({
                    ...prev,
                    daily_digest_enabled: !prev.daily_digest_enabled,
                  }))
                }
                className={toggleClass(form.daily_digest_enabled)}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    form.daily_digest_enabled ? 'right-0.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="mt-3">
              <label className="text-white/60 text-xs mb-1 block" htmlFor="daily_digest_hour_utc">
                Hour UTC
              </label>
              <input
                id="daily_digest_hour_utc"
                type="number"
                min={0}
                max={23}
                disabled={!form.daily_digest_enabled}
                value={form.daily_digest_hour_utc}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    daily_digest_hour_utc: Number(event.target.value),
                  }))
                }
                className={fieldClass('daily_digest_hour_utc')}
              />
              <p className="text-white/30 text-xs mt-1">
                UTC hour. Current UTC: {new Date().getUTCHours()}:00
              </p>
              {fieldErrors.daily_digest_hour_utc ? (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.daily_digest_hour_utc}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-white/70 text-sm">Weekly briefing enabled</p>
              <button
                type="button"
                onClick={() =>
                  setForm(prev => ({
                    ...prev,
                    weekly_briefing_enabled: !prev.weekly_briefing_enabled,
                  }))
                }
                className={toggleClass(form.weekly_briefing_enabled)}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    form.weekly_briefing_enabled ? 'right-0.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="mt-3">
              <label className="text-white/60 text-xs mb-1 block" htmlFor="weekly_briefing_day">
                Day
              </label>
              <select
                id="weekly_briefing_day"
                disabled={!form.weekly_briefing_enabled}
                value={form.weekly_briefing_day}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    weekly_briefing_day: Number(event.target.value),
                  }))
                }
                className={fieldClass('weekly_briefing_day')}
              >
                {WEEK_DAYS.map(day => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              {fieldErrors.weekly_briefing_day ? (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.weekly_briefing_day}</p>
              ) : null}
            </div>
          </div>
        </div>
      </form>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => {
          void onSave()
        }}
        onCancel={onCancel}
      />
    </div>
  )
}
