'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import TopBar from '@/components/layout/TopBar'
import { CheckCircle, Edit2, Plus, Trash2 } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

type Period = 'today' | 'weekly' | 'monthly' | 'annual'

interface Goal {
  id: string
  period: Period
  metric: string
  target: string
  why: string
  sort_order: number
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
}

const PERIODS: Period[] = ['today', 'weekly', 'monthly', 'annual']

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [form, setForm] = useState({ metric: '', target: '', why: '', period: 'today' as Period })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const res = await fetch('/api/intelligence/goals')
    const d = await res.json()
    setGoals(d.goals ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const res = await fetch('/api/intelligence/goals')
      const d = await res.json()
      if (cancelled) return
      setGoals(d.goals ?? [])
      setLoading(false)
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    const body = editing
      ? { id: editing.id, ...form }
      : form
    const method = editing ? 'PATCH' : 'POST'
    await fetch('/api/intelligence/goals', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
    setEditing(null)
    setShowForm(false)
    setSaving(false)
    setForm({ metric: '', target: '', why: '', period: 'today' })
  }

  async function handleDelete(id: string) {
    await fetch('/api/intelligence/goals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  function startEdit(g: Goal) {
    setEditing(g)
    setForm({ metric: g.metric, target: g.target, why: g.why, period: g.period })
    setShowForm(true)
  }

  function startNew(period: Period) {
    setEditing(null)
    setForm({ metric: '', target: '', why: '', period })
    setShowForm(true)
  }

  if (loading) return (
    <div>
      <TopBar title="Goals" />
      <div className="p-4 text-sm text-muted-foreground">Loading…</div>
    </div>
  )

  return (
    <div>
      <TopBar title="Goals" />
      <div className="p-4 space-y-5">
        <p className="text-sm text-muted-foreground">
          Set your targets here. The AI dealer brief reports against these goals daily.
        </p>

        {PERIODS.map(period => {
          const periodGoals = goals.filter(g => g.period === period)
          return (
            <div key={period}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{PERIOD_LABELS[period]}</h3>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => startNew(period)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {periodGoals.length === 0 && (
                  <p className="text-xs text-muted-foreground pl-1">No goals set yet.</p>
                )}
                {periodGoals.map(g => (
                  <div key={g.id} className="flex items-start gap-2 rounded-lg border p-3">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{g.metric}</p>
                      <p className="text-sm text-primary font-semibold">{g.target}</p>
                      {g.why && <p className="text-xs text-muted-foreground mt-0.5">{g.why}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => startEdit(g)} title="Edit goal">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <ConfirmActionDialog
                        title="Remove this goal?"
                        description="This goal will be deleted from the AI dealer brief and team tracking."
                        confirmLabel="Remove goal"
                        confirmVariant="destructive"
                        onConfirm={() => handleDelete(g.id)}
                        trigger={(
                          <button className="p-1 text-muted-foreground hover:text-destructive" title="Delete goal">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setShowForm(false)}>
            <div className="bg-background w-full max-w-lg rounded-t-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold">{editing ? 'Edit Goal' : 'New Goal'}</h3>

              <div>
                <label className="text-xs text-muted-foreground">Period</label>
                <select
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-background"
                  value={form.period}
                  onChange={e => setForm(f => ({ ...f, period: e.target.value as Period }))}
                >
                  {PERIODS.map(p => (
                    <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Metric</label>
                <input
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-background"
                  placeholder="e.g. leads_responded, units_sold"
                  value={form.metric}
                  onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Target</label>
                <input
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-background"
                  placeholder="e.g. 100%, 15 units, $1,800"
                  value={form.target}
                  onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Why it matters</label>
                <input
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-background"
                  placeholder="Brief reason"
                  value={form.why}
                  onChange={e => setForm(f => ({ ...f, why: e.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditing(null) }}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving || !form.metric || !form.target}>
                  {saving ? 'Saving…' : 'Save Goal'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
