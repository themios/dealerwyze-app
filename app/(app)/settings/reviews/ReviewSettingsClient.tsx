'use client'

import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Star, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  googleReviewUrl: string
  reviewRequestEnabled: boolean
  reviewRequestDelayDays: number
}

async function patchOrgSettings(payload: Record<string, unknown>) {
  const res = await fetch('/api/settings/org', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Save failed')
}

export default function ReviewSettingsClient({ googleReviewUrl, reviewRequestEnabled, reviewRequestDelayDays }: Props) {
  const [reviewUrl, setReviewUrl]       = useState(googleReviewUrl)
  const [enabled, setEnabled]           = useState(reviewRequestEnabled)
  const [delayDays, setDelayDays]       = useState(String(reviewRequestDelayDays))
  const [saving, setSaving]             = useState(false)
  const [status, setStatus]             = useState<'idle' | 'saved' | 'error'>('idle')

  async function save() {
    const days = parseInt(delayDays, 10)
    if (isNaN(days) || days < 0 || days > 365) {
      setStatus('error')
      return
    }
    setSaving(true)
    setStatus('idle')
    try {
      await patchOrgSettings({
        google_review_url: reviewUrl.trim() || null,
        review_request_enabled: enabled,
        review_request_delay_days: days,
      })
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Google Reviews" />
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

        {/* How to find your review link */}
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-4 space-y-1">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">How to find your Google review link</p>
          <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Go to <strong>Google Business Profile</strong> (business.google.com)</li>
            <li>Select your location and click <strong>Get more reviews</strong></li>
            <li>Copy the short link that starts with <code className="bg-blue-100 dark:bg-blue-900 rounded px-1">g.page/r/</code></li>
          </ol>
        </div>

        {/* Settings card */}
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            <h2 className="font-semibold text-base">Review Request Settings</h2>
          </div>

          {/* Google review link */}
          <div className="space-y-1.5">
            <Label>Your Google Review Link</Label>
            <div className="flex gap-2">
              <Input
                value={reviewUrl}
                onChange={e => setReviewUrl(e.target.value)}
                placeholder="https://g.page/r/your-business/review"
                className="h-11 flex-1"
              />
              {reviewUrl && (
                <a href={reviewUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="outline" className="h-11 px-3" title="Test link">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium">Auto-send after sale</p>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically send a review request when a vehicle is marked sold</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>

          {/* Delay days */}
          {enabled && (
            <div className="space-y-1.5 border-t pt-4">
              <Label>Send after how many days?</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={delayDays}
                  onChange={e => setDelayDays(e.target.value)}
                  className="h-11 w-28"
                />
                <p className="text-sm text-muted-foreground">
                  {delayDays === '0' || delayDays === ''
                    ? 'Sends immediately when the sale is saved'
                    : `Sends ${delayDays} day${parseInt(delayDays) === 1 ? '' : 's'} after the sale date`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Day 0 = immediately (customer excitement is highest right after the sale). Day 3-7 = after they have driven the car.
              </p>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
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
        </div>

        {/* Info about what gets sent */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold">What gets sent</p>
          <p className="text-xs text-muted-foreground">
            When triggered, the customer receives:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>SMS</strong> - a short, friendly text with the review link (if they have a phone on file and have not opted out)</li>
            <li><strong>Email</strong> - a brief thank-you note with the review link (if they have an email on file and have not opted out)</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-1">
            A customer will only receive one review request every 60 days to avoid repeat messages.
          </p>
        </div>

      </div>
    </div>
  )
}
