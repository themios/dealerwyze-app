'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronUp, ChevronDown, X } from 'lucide-react'

interface TemplateOption {
  id: string
  name: string
  subject: string | null
  body: string
  channel: string
}

interface Step {
  id: string
  sort_order: number
  day_offset: number
  send_hour: number
  template_id: string | null
  template?: TemplateOption | null
}

interface Sequence {
  id: string
  name: string
  channel: 'sms' | 'email'
  auto_mode: 'manual' | 'semi_auto' | 'full_auto'
}

interface Props {
  sequence: Sequence
  initialSteps: Step[]
  templates: TemplateOption[]
}

const AUTO_MODES = [
  { value: 'manual', label: 'Manual', desc: 'Shows next step on Today screen. You send it.' },
  { value: 'semi_auto', label: 'Review Before Send', desc: 'Steps appear for approval before sending.' },
  { value: 'full_auto', label: 'Auto-Send', desc: 'Steps fire on schedule automatically.' },
] as const

function hourTo12(h: number): { hour: number; ampm: 'AM' | 'PM' } {
  if (h === 0) return { hour: 12, ampm: 'AM' }
  if (h < 12) return { hour: h, ampm: 'AM' }
  if (h === 12) return { hour: 12, ampm: 'PM' }
  return { hour: h - 12, ampm: 'PM' }
}

function hour12To24(hour: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') return hour === 12 ? 0 : hour
  return hour === 12 ? 12 : hour + 12
}

export default function SequenceEditor({ sequence, initialSteps, templates }: Props) {
  const [name, setName] = useState(sequence.name)
  const [autoMode, setAutoMode] = useState<'manual' | 'semi_auto' | 'full_auto'>(sequence.auto_mode)
  const [steps, setSteps] = useState<Step[]>(initialSteps)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addingStep, setAddingStep] = useState(false)

  const markDirty = useCallback(() => setDirty(true), [])

  async function saveSequence() {
    setSaving(true)
    try {
      await fetch(`/api/sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, auto_mode: autoMode }),
      })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleStepChange(stepId: string, field: keyof Step, value: unknown) {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s))

    const patch: Record<string, unknown> = {}
    if (field === 'template_id') patch.template_id = value
    if (field === 'day_offset') patch.day_offset = value
    if (field === 'send_hour') patch.send_hour = value

    if (Object.keys(patch).length > 0) {
      await fetch(`/api/sequences/${sequence.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }
  }

  async function handleAddStep() {
    setAddingStep(true)
    try {
      const lastStep = steps[steps.length - 1]
      const defaultOffset = sequence.channel === 'email'
        ? (lastStep ? lastStep.day_offset + 2 : 0)
        : (lastStep ? lastStep.day_offset + 1 : 0)
      const defaultHour = sequence.channel === 'email' ? 9 : 12
      const sortOrder = steps.length

      const res = await fetch(`/api/sequences/${sequence.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_offset: defaultOffset, send_hour: defaultHour, sort_order: sortOrder }),
      })
      if (!res.ok) return
      const { step } = await res.json()
      setSteps(prev => [...prev, step])
    } finally {
      setAddingStep(false)
    }
  }

  async function handleRemoveStep(stepId: string) {
    await fetch(`/api/sequences/${sequence.id}/steps/${stepId}`, { method: 'DELETE' })
    setSteps(prev => prev.filter(s => s.id !== stepId))
  }

  async function handleMoveStep(index: number, direction: 'up' | 'down') {
    const newSteps = [...steps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newSteps.length) return
    ;[newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
    newSteps.forEach((s, i) => { s.sort_order = i })
    setSteps(newSteps)

    await Promise.all(newSteps.map((s, i) =>
      fetch(`/api/sequences/${sequence.id}/steps/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      })
    ))
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Name + mode */}
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Sequence name</p>
          <Input
            value={name}
            onChange={e => { setName(e.target.value); markDirty() }}
            className="font-medium"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Send mode</p>
          <div className="space-y-2">
            {AUTO_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => { setAutoMode(m.value); markDirty() }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  autoMode === m.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${autoMode === m.value ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steps ({steps.length})</p>
          <Badge variant="outline" className="capitalize text-xs">{sequence.channel}</Badge>
        </div>

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No steps yet. Add your first step below.
          </p>
        )}

        <div className="space-y-3">
          {steps.map((step, index) => {
            const { hour, ampm } = hourTo12(step.send_hour)
            return (
              <div key={step.id} className="p-4 rounded-lg border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Step {index + 1}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveStep(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveStep(index, 'down')}
                      disabled={index === steps.length - 1}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveStep(step.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Template</p>
                  <select
                    value={step.template_id ?? ''}
                    onChange={e => handleStepChange(step.id, 'template_id', e.target.value || null)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">-- No template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">No {sequence.channel} templates yet. Add them in Automation &amp; Timings.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Day after enrollment</p>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={step.day_offset}
                      onChange={e => handleStepChange(step.id, 'day_offset', parseInt(e.target.value) || 0)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Send time</p>
                    <div className="flex gap-1.5">
                      <select
                        value={hour}
                        onChange={e => {
                          const h24 = hour12To24(parseInt(e.target.value), ampm)
                          handleStepChange(step.id, 'send_hour', h24)
                        }}
                        className="flex-1 h-10 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <select
                        value={ampm}
                        onChange={e => {
                          const h24 = hour12To24(hour, e.target.value as 'AM' | 'PM')
                          handleStepChange(step.id, 'send_hour', h24)
                        }}
                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Button
          variant="outline"
          onClick={handleAddStep}
          disabled={addingStep}
          className="w-full mt-3"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {addingStep ? 'Adding...' : 'Add Step'}
        </Button>
      </div>

      {/* Sticky save */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          className="w-full"
          onClick={saveSequence}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving...' : 'Save Sequence'}
        </Button>
      </div>
    </div>
  )
}
