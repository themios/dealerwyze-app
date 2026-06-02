'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type FeedbackEntry = {
  id: string
  org_id: string | null
  agent_name: string
  agent_email: string | null
  session_date: string | null
  overall_rating: number | null
  booking_flow_rating: number | null
  email_delivery_ok: boolean | null
  blockers: string | null
  feature_requests: string | null
  notes: string | null
  created_at: string
  organizations?: { name: string; slug: string | null } | null
}

const EMPTY_FORM = {
  agent_name: '',
  agent_email: '',
  session_date: new Date().toISOString().slice(0, 10),
  overall_rating: '',
  booking_flow_rating: '',
  email_delivery_ok: '',
  blockers: '',
  feature_requests: '',
  notes: '',
}

export default function PilotFeedbackPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submissionsOpen, setSubmissionsOpen] = useState(true)
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/pilot-feedback', { cache: 'no-store' })
    const json = await res.json()
    if (res.ok) {
      setEntries(json.entries ?? [])
      setSubmissionsOpen(json.submissions_open !== false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!submissionsOpen) return
    setSaving(true)
    setMessage(null)

    const payload = {
      agent_name: form.agent_name,
      agent_email: form.agent_email || null,
      session_date: form.session_date || null,
      overall_rating: form.overall_rating ? Number(form.overall_rating) : null,
      booking_flow_rating: form.booking_flow_rating ? Number(form.booking_flow_rating) : null,
      email_delivery_ok:
        form.email_delivery_ok === 'yes' ? true :
        form.email_delivery_ok === 'no' ? false : null,
      blockers: form.blockers || null,
      feature_requests: form.feature_requests || null,
      notes: form.notes || null,
    }

    const res = await fetch('/api/admin/pilot-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setForm(EMPTY_FORM)
      setMessage('Feedback saved.')
      await load()
    } else {
      const err = await res.json().catch(() => ({}))
      setMessage(err.error ?? 'Failed to save feedback.')
    }
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold">Pilot Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Internal admin log for agent debriefs during the RealtyWyze pilot. Not visible to agents.
        </p>
      </div>

      {!submissionsOpen && (
        <Card className="border-amber-300/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 text-sm">
            Submissions are closed (<code>PILOT_FEEDBACK_OPEN=false</code>). Existing entries remain visible.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Record agent feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="agent_name">Agent name</Label>
                <Input
                  id="agent_name"
                  required
                  value={form.agent_name}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, agent_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent_email">Agent email</Label>
                <Input
                  id="agent_email"
                  type="email"
                  value={form.agent_email}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, agent_email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="session_date">Session date</Label>
                <Input
                  id="session_date"
                  type="date"
                  value={form.session_date}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email_delivery_ok">Emails delivered?</Label>
                <select
                  id="email_delivery_ok"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={form.email_delivery_ok}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, email_delivery_ok: e.target.value }))}
                >
                  <option value="">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overall_rating">Overall (1–5)</Label>
                <Input
                  id="overall_rating"
                  type="number"
                  min={1}
                  max={5}
                  value={form.overall_rating}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, overall_rating: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking_flow_rating">Booking flow (1–5)</Label>
                <Input
                  id="booking_flow_rating"
                  type="number"
                  min={1}
                  max={5}
                  value={form.booking_flow_rating}
                  disabled={!submissionsOpen}
                  onChange={(e) => setForm((f) => ({ ...f, booking_flow_rating: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blockers">Blockers / bugs</Label>
              <Textarea
                id="blockers"
                rows={3}
                value={form.blockers}
                disabled={!submissionsOpen}
                onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feature_requests">Feature requests</Label>
              <Textarea
                id="feature_requests"
                rows={3}
                value={form.feature_requests}
                disabled={!submissionsOpen}
                onChange={(e) => setForm((f) => ({ ...f, feature_requests: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                disabled={!submissionsOpen}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!submissionsOpen || saving}>
                {saving ? 'Saving…' : 'Save feedback'}
              </Button>
              {message && <span className="text-sm text-muted-foreground">{message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent entries</CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No feedback recorded yet.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{entry.agent_name}</span>
                {entry.agent_email && (
                  <span className="text-xs text-muted-foreground">{entry.agent_email}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                {entry.overall_rating != null && <span>Overall: {entry.overall_rating}/5</span>}
                {entry.booking_flow_rating != null && <span>Booking: {entry.booking_flow_rating}/5</span>}
                {entry.email_delivery_ok != null && (
                  <span>Email: {entry.email_delivery_ok ? 'OK' : 'Failed'}</span>
                )}
                {entry.organizations?.name && <span>Org: {entry.organizations.name}</span>}
              </div>
              {entry.blockers && (
                <p className="text-sm"><span className="font-medium">Blockers:</span> {entry.blockers}</p>
              )}
              {entry.feature_requests && (
                <p className="text-sm"><span className="font-medium">Requests:</span> {entry.feature_requests}</p>
              )}
              {entry.notes && (
                <p className="text-sm text-muted-foreground">{entry.notes}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
