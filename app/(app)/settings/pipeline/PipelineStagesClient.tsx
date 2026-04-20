'use client'

import { useState, useEffect } from 'react'
import { OrgStage, DEFAULT_ORG_STAGES, SYSTEM_STAGE_KEYS, CUSTOM_STAGE_KEYS } from '@/lib/leads/states'
import { Flame, ChevronUp, ChevronDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const COLOR_PRESETS = [
  { name: 'Blue',   value: 'bg-blue-100 text-blue-700' },
  { name: 'Yellow', value: 'bg-yellow-100 text-yellow-700' },
  { name: 'Orange', value: 'bg-orange-100 text-orange-700' },
  { name: 'Purple', value: 'bg-purple-100 text-purple-700' },
  { name: 'Indigo', value: 'bg-indigo-100 text-indigo-700' },
  { name: 'Cyan',   value: 'bg-cyan-100 text-cyan-700' },
  { name: 'Amber',  value: 'bg-amber-100 text-amber-700' },
  { name: 'Green',  value: 'bg-green-100 text-green-700' },
  { name: 'Red',    value: 'bg-red-100 text-red-700' },
  { name: 'Gray',   value: 'bg-gray-100 text-gray-500' },
  { name: 'Pink',   value: 'bg-pink-100 text-pink-700' },
  { name: 'Teal',   value: 'bg-teal-100 text-teal-700' },
  { name: 'Violet', value: 'bg-violet-100 text-violet-700' },
  { name: 'Rose',   value: 'bg-rose-100 text-rose-700' },
  { name: 'Lime',   value: 'bg-lime-100 text-lime-700' },
]

function dotBg(color: string): string {
  const bg = color.split(' ')[0]
  return bg.replace('100', '400')
}

export default function PipelineStagesClient() {
  const [stages, setStages] = useState<OrgStage[]>(DEFAULT_ORG_STAGES)
  const [original, setOriginal] = useState<OrgStage[]>(DEFAULT_ORG_STAGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pipeline-stages')
      .then(r => r.ok ? r.json() : null)
      .then((d: OrgStage[] | null) => {
        if (d?.length) {
          setStages(d)
          setOriginal(d)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isDirty = JSON.stringify(stages) !== JSON.stringify(original)

  function update(key: string, patch: Partial<OrgStage>) {
    setStages(prev => prev.map(s => s.stage_key === key ? { ...s, ...patch } : s))
    setStatus('idle')
  }

  function moveUp(index: number) {
    if (index === 0) return
    setStages(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setStatus('idle')
  }

  function moveDown(index: number) {
    if (index === stages.length - 1) return
    setStages(prev => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setStatus('idle')
  }

  async function save() {
    setSaving(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stages),
      })
      if (res.ok) {
        setOriginal(stages)
        setStatus('success')
      } else {
        const d = await res.json().catch(() => ({}))
        setErrorMsg(d.error ?? 'Failed to save changes')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error — please try again')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading stages...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Dirty indicator */}
      {isDirty && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Unsaved changes
        </div>
      )}

      {stages.map((stage, index) => {
        const isSystem = SYSTEM_STAGE_KEYS.includes(stage.stage_key)
        const isCustom = CUSTOM_STAGE_KEYS.includes(stage.stage_key)
        const isInactive = !stage.is_active

        // Inactive custom stage — show a simple "tap to enable" row
        if (isCustom && isInactive) {
          return (
            <button
              key={stage.stage_key}
              onClick={() => update(stage.stage_key, { is_active: true })}
              className="w-full rounded-xl border border-dashed bg-card p-3 flex items-center justify-between text-muted-foreground hover:text-foreground hover:border-border hover:bg-accent transition-colors"
            >
              <span className="text-sm">+ Enable custom stage</span>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">Custom</span>
            </button>
          )
        }

        return (
          <div
            key={stage.stage_key}
            className="rounded-xl border bg-card p-3 space-y-2"
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              {/* Move buttons */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === stages.length - 1}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Label input */}
              <input
                type="text"
                value={stage.label}
                onChange={e => update(stage.stage_key, { label: e.target.value })}
                className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-transparent focus:border-border focus:outline-none px-1 py-0.5"
                placeholder="Stage name"
                maxLength={30}
              />

              {/* System / Custom badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${isSystem ? 'bg-muted text-muted-foreground' : 'bg-blue-50 text-blue-600'}`}>
                {isSystem ? 'System' : 'Custom'}
              </span>

              {/* Flame (hot) toggle */}
              <button
                onClick={() => update(stage.stage_key, { is_hot: !stage.is_hot })}
                title={stage.is_hot ? 'Remove hot flag' : 'Mark as hot stage'}
                className={`p-1 rounded flex-shrink-0 transition-colors ${stage.is_hot ? 'text-orange-500' : 'text-muted-foreground hover:text-orange-400'}`}
              >
                <Flame className="h-4 w-4" />
              </button>

              {/* Disable toggle for active custom stages */}
              {isCustom && (
                <button
                  onClick={() => update(stage.stage_key, { is_active: false })}
                  className="text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600 transition-colors"
                  title="Click to disable this stage"
                >
                  Active
                </button>
              )}
            </div>

            {/* Color picker row */}
            <div className="flex items-center gap-2 pl-8">
              <span className="text-[10px] text-muted-foreground">Color:</span>
              <div className="relative">
                <button
                  onClick={() => setColorPickerOpen(colorPickerOpen === stage.stage_key ? null : stage.stage_key)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${stage.color}`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${dotBg(stage.color)}`} />
                  {COLOR_PRESETS.find(p => p.value === stage.color)?.name ?? 'Custom'}
                </button>
                {colorPickerOpen === stage.stage_key && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-48">
                    {COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        onClick={() => {
                          update(stage.stage_key, { color: preset.value })
                          setColorPickerOpen(null)
                        }}
                        title={preset.name}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${dotBg(preset.value)} ${stage.color === preset.value ? 'border-foreground' : 'border-transparent'}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Live preview badge */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${stage.color}`}>
                {stage.label || 'Stage'}
              </span>
            </div>
          </div>
        )
      })}

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>

        {status === 'success' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
}
