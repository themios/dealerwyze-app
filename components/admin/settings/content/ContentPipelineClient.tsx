'use client'

import { useMemo, useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import SaveBar from '@/components/admin/settings/SaveBar'

const PLATFORM_OPTIONS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'threads'] as const
const DAY_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

interface PlatformContentConfig {
  marketing_org_id: string
  default_platforms: string[]
  weekly_generator_enabled: boolean
  weekly_generator_day: number
  weekly_generator_hour_utc: number
  default_content_themes: string[]
  ai_brand_voice_prompt: string
  tavily_categories: string[]
  posts_per_week: number
  updated_at: string | null
}

type ContentPipelineClientProps = {
  initialData: Partial<{
    marketing_org_id: string | null
    default_platforms: string[] | null
    weekly_generator_enabled: boolean | null
    weekly_generator_day: number | null
    weekly_generator_hour_utc: number | null
    default_content_themes: string[] | null
    ai_brand_voice_prompt: string | null
    tavily_categories: string[] | null
    posts_per_week: number | null
    updated_at: string | null
  }>
}

type FieldErrors = Partial<Record<keyof Omit<PlatformContentConfig, 'updated_at'>, string>>

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function getInitialFormState(input: ContentPipelineClientProps['initialData']): PlatformContentConfig {
  return {
    marketing_org_id: input.marketing_org_id ?? '',
    default_platforms: input.default_platforms ?? ['instagram', 'tiktok'],
    weekly_generator_enabled: input.weekly_generator_enabled ?? false,
    weekly_generator_day: input.weekly_generator_day ?? 0,
    weekly_generator_hour_utc: input.weekly_generator_hour_utc ?? 15,
    default_content_themes: input.default_content_themes ?? ['lead_follow_up', 'platform_spotlight'],
    ai_brand_voice_prompt: input.ai_brand_voice_prompt ?? '',
    tavily_categories: input.tavily_categories ?? ['automotive', 'crm', 'dealer'],
    posts_per_week: input.posts_per_week ?? 7,
    updated_at: input.updated_at ?? null,
  }
}

export default function ContentPipelineClient({ initialData }: ContentPipelineClientProps) {
  const initialForm = useMemo(() => getInitialFormState(initialData), [initialData])
  const [baseForm, setBaseForm] = useState(initialForm)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(initialForm.updated_at)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const dirty = useMemo(() => {
    return (
      form.marketing_org_id !== baseForm.marketing_org_id ||
      JSON.stringify(form.default_platforms) !== JSON.stringify(baseForm.default_platforms) ||
      form.weekly_generator_enabled !== baseForm.weekly_generator_enabled ||
      Number(form.weekly_generator_day) !== Number(baseForm.weekly_generator_day) ||
      Number(form.weekly_generator_hour_utc) !== Number(baseForm.weekly_generator_hour_utc) ||
      JSON.stringify(form.default_content_themes) !== JSON.stringify(baseForm.default_content_themes) ||
      form.ai_brand_voice_prompt !== baseForm.ai_brand_voice_prompt ||
      JSON.stringify(form.tavily_categories) !== JSON.stringify(baseForm.tavily_categories) ||
      Number(form.posts_per_week) !== Number(baseForm.posts_per_week)
    )
  }, [form, baseForm])

  function togglePlatform(platform: (typeof PLATFORM_OPTIONS)[number]) {
    setForm(prev => {
      const exists = prev.default_platforms.includes(platform)
      const nextPlatforms = exists
        ? prev.default_platforms.filter(p => p !== platform)
        : [...prev.default_platforms, platform]
      return { ...prev, default_platforms: nextPlatforms }
    })
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/admin/settings/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          posts_per_week: Number(form.posts_per_week),
          weekly_generator_day: Number(form.weekly_generator_day),
          weekly_generator_hour_utc: Number(form.weekly_generator_hour_utc),
          marketing_org_id: form.marketing_org_id.trim() || null,
          ai_brand_voice_prompt: form.ai_brand_voice_prompt.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload?.error === 'validation_failed' && payload?.field) {
          const field = payload.field as keyof Omit<PlatformContentConfig, 'updated_at'>
          setFieldErrors({ [field]: payload.message ?? 'Invalid value' })
        }
        setError(payload?.message ?? payload?.error ?? 'Could not save settings')
        return
      }

      const updated = getInitialFormState(payload.data ?? {})
      setBaseForm(updated)
      setForm(updated)
      setSavedAt(updated.updated_at ?? new Date().toISOString())
      setFieldErrors({})
      setError(null)
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

  function fieldClass(name: keyof Omit<PlatformContentConfig, 'updated_at'>) {
    return `bg-[#07131F] border text-white rounded-lg px-3 py-2 text-sm w-full ${
      fieldErrors[name] ? 'border-red-500' : 'border-[#1B4A8A]/40'
    }`
  }

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Content Pipeline"
        description="AI content generation settings and defaults."
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
            <p className="text-white/60 text-xs mb-2">Default Platforms</p>
            <div className="flex flex-wrap gap-4">
              {PLATFORM_OPTIONS.map(platform => (
                <label key={platform} className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={form.default_platforms.includes(platform)}
                    onChange={() => togglePlatform(platform)}
                    className="accent-[#F07018]"
                  />
                  {platform}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="posts_per_week">
              Posts Per Week
            </label>
            <input
              id="posts_per_week"
              type="number"
              min={1}
              max={28}
              value={form.posts_per_week}
              onChange={event => setForm(prev => ({ ...prev, posts_per_week: Number(event.target.value) }))}
              className={fieldClass('posts_per_week')}
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="marketing_org_id">
              Marketing Org ID
            </label>
            <input
              id="marketing_org_id"
              type="text"
              placeholder="Organization UUID (optional)"
              value={form.marketing_org_id}
              onChange={event => setForm(prev => ({ ...prev, marketing_org_id: event.target.value }))}
              className={fieldClass('marketing_org_id')}
            />
            <p className="text-white/30 text-xs mt-1">
              UUID of the org whose drafts feed the content pipeline
            </p>
          </div>
        </div>

        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/80">Auto-generate weekly content calendar</p>
            <button
              type="button"
              onClick={() =>
                setForm(prev => ({ ...prev, weekly_generator_enabled: !prev.weekly_generator_enabled }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.weekly_generator_enabled ? 'bg-[#F07018]' : 'bg-white/20'
              }`}
              aria-label="Toggle weekly generator"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  form.weekly_generator_enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {form.weekly_generator_enabled ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-white/60 text-xs mb-1 block" htmlFor="weekly_generator_day">
                  Day of Week
                </label>
                <select
                  id="weekly_generator_day"
                  value={form.weekly_generator_day}
                  onChange={event =>
                    setForm(prev => ({ ...prev, weekly_generator_day: Number(event.target.value) }))
                  }
                  className={fieldClass('weekly_generator_day')}
                >
                  {DAY_OPTIONS.map(day => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/60 text-xs mb-1 block" htmlFor="weekly_generator_hour_utc">
                  Hour (UTC)
                </label>
                <input
                  id="weekly_generator_hour_utc"
                  type="number"
                  min={0}
                  max={23}
                  value={form.weekly_generator_hour_utc}
                  onChange={event =>
                    setForm(prev => ({ ...prev, weekly_generator_hour_utc: Number(event.target.value) }))
                  }
                  className={fieldClass('weekly_generator_hour_utc')}
                />
                <p className="text-white/30 text-xs mt-1">
                  24h UTC. Current UTC hour: {new Date().getUTCHours()}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 space-y-4 mt-4">
          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="ai_brand_voice_prompt">
              AI Brand Voice Prompt
            </label>
            <textarea
              id="ai_brand_voice_prompt"
              rows={4}
              maxLength={2000}
              placeholder="Describe the brand voice for AI-generated captions and scripts..."
              value={form.ai_brand_voice_prompt}
              onChange={event => setForm(prev => ({ ...prev, ai_brand_voice_prompt: event.target.value }))}
              className={fieldClass('ai_brand_voice_prompt')}
            />
            <p className="text-white/30 text-xs mt-1">
              {(form.ai_brand_voice_prompt?.length ?? 0)}/2000
            </p>
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="default_content_themes">
              Content Themes
            </label>
            <input
              id="default_content_themes"
              value={form.default_content_themes.join(', ')}
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  default_content_themes: parseCommaSeparated(event.target.value),
                }))
              }
              className={fieldClass('default_content_themes')}
            />
            <p className="text-white/30 text-xs mt-1">
              Comma-separated. e.g. lead_follow_up, platform_spotlight
            </p>
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block" htmlFor="tavily_categories">
              Tavily Research Categories
            </label>
            <input
              id="tavily_categories"
              value={form.tavily_categories.join(', ')}
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  tavily_categories: parseCommaSeparated(event.target.value),
                }))
              }
              className={fieldClass('tavily_categories')}
            />
            <p className="text-white/30 text-xs mt-1">
              Topics for weekly research queries. e.g. automotive, crm, dealer
            </p>
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
