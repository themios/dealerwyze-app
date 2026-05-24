'use client'

import { useMemo, useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import SaveBar from '@/components/admin/settings/SaveBar'

interface PlatformSettings {
  platform_name: string
  support_email: string
  support_phone: string
  help_url: string
  terms_url: string
  privacy_url: string
  default_trial_days: number
  default_timezone: string
  updated_at: string | null
}

interface GeneralSettingsClientProps {
  initialData: Partial<{
    platform_name: string | null
    support_email: string | null
    support_phone: string | null
    help_url: string | null
    terms_url: string | null
    privacy_url: string | null
    default_trial_days: number | null
    default_timezone: string | null
    updated_at: string | null
  }>
}

type FormErrors = Partial<Record<keyof Omit<PlatformSettings, 'updated_at'>, string>>

function getInitialFormState(input: GeneralSettingsClientProps['initialData']): PlatformSettings {
  return {
    platform_name: input.platform_name ?? 'DealerWyze',
    support_email: input.support_email ?? 'support@dealerwyze.com',
    support_phone: input.support_phone ?? '',
    help_url: input.help_url ?? '',
    terms_url: input.terms_url ?? '',
    privacy_url: input.privacy_url ?? '',
    default_trial_days: input.default_trial_days ?? 30,
    default_timezone: input.default_timezone ?? 'America/Los_Angeles',
    updated_at: input.updated_at ?? null,
  }
}

export default function GeneralSettingsClient({ initialData }: GeneralSettingsClientProps) {
  const initialForm = useMemo(() => getInitialFormState(initialData), [initialData])
  const [baseForm, setBaseForm] = useState(initialForm)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(initialForm.updated_at)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  const dirty = useMemo(() => {
    return (
      form.platform_name !== baseForm.platform_name ||
      form.support_email !== baseForm.support_email ||
      form.support_phone !== baseForm.support_phone ||
      form.help_url !== baseForm.help_url ||
      form.terms_url !== baseForm.terms_url ||
      form.privacy_url !== baseForm.privacy_url ||
      Number(form.default_trial_days) !== Number(baseForm.default_trial_days) ||
      form.default_timezone !== baseForm.default_timezone
    )
  }, [form, baseForm])

  async function onSave() {
    setSaving(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/admin/settings/general', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform_name: form.platform_name,
          support_email: form.support_email,
          support_phone: form.support_phone,
          help_url: form.help_url,
          terms_url: form.terms_url,
          privacy_url: form.privacy_url,
          default_trial_days: Number(form.default_trial_days),
          default_timezone: form.default_timezone,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (payload?.error === 'validation_failed' && payload?.field) {
          const field = payload.field as keyof Omit<PlatformSettings, 'updated_at'>
          setFieldErrors({ [field]: payload.message ?? 'Invalid value' })
        }
        setError(payload?.message ?? payload?.error ?? 'Could not save settings')
        return
      }

      const updated = getInitialFormState(payload.data ?? {})
      setBaseForm(updated)
      setForm(updated)
      setSavedAt(updated.updated_at ?? new Date().toISOString())
      setError(null)
      setFieldErrors({})
    } catch {
      setError('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  function onCancel() {
    setForm(baseForm)
    setError(null)
    setFieldErrors({})
  }

  function fieldClass(name: keyof Omit<PlatformSettings, 'updated_at'>) {
    return `bg-[#07131F] border text-white rounded-lg px-3 py-2 text-sm w-full ${
      fieldErrors[name] ? 'border-red-500' : 'border-[#1B4A8A]/40'
    }`
  }

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="General Settings"
        description="Core platform identity and defaults."
        updatedAt={savedAt}
      />

      {error ? <p className="text-red-400 text-sm mb-4">{error}</p> : null}

      <form
        onSubmit={event => {
          event.preventDefault()
          void onSave()
        }}
      >
        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-white/60 text-xs mb-1 block" htmlFor="platform_name">
              Platform Name
            </label>
            <input
              id="platform_name"
              value={form.platform_name}
              onChange={event => setForm(prev => ({ ...prev, platform_name: event.target.value }))}
              className={fieldClass('platform_name')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="support_email">
              Support Email
            </label>
            <input
              id="support_email"
              value={form.support_email}
              onChange={event => setForm(prev => ({ ...prev, support_email: event.target.value }))}
              className={fieldClass('support_email')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="support_phone">
              Support Phone
            </label>
            <input
              id="support_phone"
              value={form.support_phone}
              onChange={event => setForm(prev => ({ ...prev, support_phone: event.target.value }))}
              className={fieldClass('support_phone')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="default_timezone">
              Default Timezone
            </label>
            <input
              id="default_timezone"
              value={form.default_timezone}
              onChange={event => setForm(prev => ({ ...prev, default_timezone: event.target.value }))}
              className={fieldClass('default_timezone')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="default_trial_days">
              Default Trial Days
            </label>
            <input
              id="default_trial_days"
              type="number"
              min={1}
              max={365}
              value={form.default_trial_days}
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  default_trial_days: Number(event.target.value),
                }))
              }
              className={fieldClass('default_trial_days')}
            />
          </div>

          <div />

          <p className="text-white/40 text-xs uppercase tracking-widest md:col-span-2 mt-2">
            Public URLs
          </p>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="help_url">
              Help URL
            </label>
            <input
              id="help_url"
              value={form.help_url}
              onChange={event => setForm(prev => ({ ...prev, help_url: event.target.value }))}
              className={fieldClass('help_url')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="terms_url">
              Terms URL
            </label>
            <input
              id="terms_url"
              value={form.terms_url}
              onChange={event => setForm(prev => ({ ...prev, terms_url: event.target.value }))}
              className={fieldClass('terms_url')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="privacy_url">
              Privacy URL
            </label>
            <input
              id="privacy_url"
              value={form.privacy_url}
              onChange={event => setForm(prev => ({ ...prev, privacy_url: event.target.value }))}
              className={fieldClass('privacy_url')}
            />
          </div>

          <div />
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
