'use client'

import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ExternalLink } from 'lucide-react'

type SocialPostingState = {
  meta_page_id: string
  instagram_business_account_id: string
  meta_page_access_token_input: string
  token_configured: boolean
  facebook_feed: boolean
  instagram_feed: boolean
  facebook_story: boolean
  instagram_story: boolean
  daily_ai_post_enabled: boolean
  daily_ai_timezone: string
  last_daily_post_at: string | null
}

/** API shape (no token field). */
interface SocialPostingDto {
  meta_page_id: string | null
  instagram_business_account_id: string | null
  token_configured: boolean
  facebook_feed: boolean
  instagram_feed: boolean
  facebook_story: boolean
  instagram_story: boolean
  daily_ai_post_enabled: boolean
  daily_ai_timezone: string
  last_daily_post_at: string | null
}

export default function SocialPostingSection() {
  const [form, setForm] = useState<SocialPostingState>({
    meta_page_id:                    '',
    instagram_business_account_id:   '',
    meta_page_access_token_input:    '',
    token_configured:                false,
    facebook_feed:                   true,
    instagram_feed:                  true,
    facebook_story:                  false,
    instagram_story:                 false,
    daily_ai_post_enabled:           false,
    daily_ai_timezone:               'America/Los_Angeles',
    last_daily_post_at:              null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/social-posting')
      .then(async r => {
        if (!r.ok) throw new Error('Could not load')
        return r.json()
      })
      .then((d: SocialPostingDto) => {
        setForm({
          meta_page_id:                  d.meta_page_id ?? '',
          instagram_business_account_id: d.instagram_business_account_id ?? '',
          meta_page_access_token_input:  '',
          token_configured:              d.token_configured,
          facebook_feed:                 d.facebook_feed ?? true,
          instagram_feed:                d.instagram_feed ?? true,
          facebook_story:                d.facebook_story ?? false,
          instagram_story:               d.instagram_story ?? false,
          daily_ai_post_enabled:         d.daily_ai_post_enabled ?? false,
          daily_ai_timezone:             d.daily_ai_timezone ?? 'America/Los_Angeles',
          last_daily_post_at:            d.last_daily_post_at,
        })
        setLoading(false)
      })
      .catch(() => {
        setErr('Social settings unavailable (admin required).')
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setErr(null)
    const tokenPatch =
      form.meta_page_access_token_input.trim().length > 0
        ? form.meta_page_access_token_input.trim()
        : undefined

    try {
      const updated = await apiFetch<SocialPostingDto>('/api/settings/social-posting', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          meta_page_id:                  form.meta_page_id.trim() || null,
          instagram_business_account_id: form.instagram_business_account_id.trim() || null,
          ...(tokenPatch !== undefined
            ? { meta_page_access_token: tokenPatch }
            : {}),
          facebook_feed:         form.facebook_feed,
          instagram_feed:        form.instagram_feed,
          facebook_story:        form.facebook_story,
          instagram_story:       form.instagram_story,
          daily_ai_post_enabled: form.daily_ai_post_enabled,
          daily_ai_timezone:     form.daily_ai_timezone,
        }),
      })
      setForm(prev => ({
        ...prev,
        meta_page_access_token_input:    '',
        meta_page_id:                   updated.meta_page_id ?? '',
        instagram_business_account_id:  updated.instagram_business_account_id ?? '',
        token_configured:               updated.token_configured,
        facebook_feed:                  updated.facebook_feed,
        instagram_feed:                 updated.instagram_feed,
        facebook_story:                 updated.facebook_story,
        instagram_story:                updated.instagram_story,
        daily_ai_post_enabled:          updated.daily_ai_post_enabled,
        daily_ai_timezone:              updated.daily_ai_timezone,
        last_daily_post_at:             updated.last_daily_post_at,
      }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 pt-2 border-t">
        <p className="text-sm font-semibold mb-2">Social posting</p>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 border-t space-y-4">
      <div>
        <p className="text-sm font-semibold">Social posting (Meta)</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
          Connect a{' '}
          <a
            href="https://developers.facebook.com/docs/pages-api/posts"
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-0.5"
          >
            Facebook Page access token{' '}
            <ExternalLink className="h-3 w-3" />
          </a>{' '}
          plus your Instagram Business account ID to post listings and rendered videos straight to feed
          surfaces. TikTok / YouTube adapters can follow separately.
        </p>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="space-y-3 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="meta-page-id">Facebook Page ID</Label>
          <Input
            id="meta-page-id"
            value={form.meta_page_id}
            onChange={e => setForm(prev => ({ ...prev, meta_page_id: e.target.value }))}
            placeholder="Numeric Page ID"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ig-user-id">Instagram Business account ID</Label>
          <Input
            id="ig-user-id"
            value={form.instagram_business_account_id}
            onChange={e =>
              setForm(prev => ({ ...prev, instagram_business_account_id: e.target.value }))
            }
            placeholder="Instagram User ID linked to your Page"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meta-token">
            Page access token{' '}
            <span className="text-muted-foreground font-normal">
              ({form.token_configured ? 'stored — paste to replace' : 'required'})
            </span>
          </Label>
          <Input
            id="meta-token"
            type="password"
            value={form.meta_page_access_token_input}
            onChange={e =>
              setForm(prev => ({ ...prev, meta_page_access_token_input: e.target.value }))
            }
            placeholder="EAAG..."
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-sm">Facebook feed</span>
          <Switch
            checked={form.facebook_feed}
            onCheckedChange={v => setForm(prev => ({ ...prev, facebook_feed: v }))}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-sm">Instagram feed</span>
          <Switch
            checked={form.instagram_feed}
            onCheckedChange={v => setForm(prev => ({ ...prev, instagram_feed: v }))}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-sm">Instagram Stories (images)</span>
          <Switch
            checked={form.instagram_story}
            onCheckedChange={v => setForm(prev => ({ ...prev, instagram_story: v }))}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-sm">Facebook Stories</span>
          <Switch
            checked={form.facebook_story}
            onCheckedChange={v => setForm(prev => ({ ...prev, facebook_story: v }))}
          />
        </label>
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 space-y-2 max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Daily AI spotlight</p>
            <p className="text-xs text-muted-foreground mt-1">
              Once per day (min. ~20h apart), auto-pick one in-stock unit with photos,{' '}
              write a caption with Groq when configured, and post to enabled feed destinations.
              Schedule the <code className="text-[11px]">/api/cron/daily-social</code> cron in production.
            </p>
          </div>
          <Switch
            checked={form.daily_ai_post_enabled}
            onCheckedChange={v =>
              setForm(prev => ({ ...prev, daily_ai_post_enabled: v }))
            }
          />
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="daily-tz">Timezone label (reference)</Label>
          <Input
            id="daily-tz"
            value={form.daily_ai_timezone}
            onChange={e => setForm(prev => ({ ...prev, daily_ai_timezone: e.target.value }))}
          />
        </div>
        {form.last_daily_post_at && (
          <p className="text-xs text-muted-foreground">
            Last auto post:{' '}
            {new Date(form.last_daily_post_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        )}
      </div>

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Social Settings'}
      </Button>
    </div>
  )
}
