'use client'

import { useState, useRef, useEffect } from 'react'
import { OrgStage, DEFAULT_ORG_STAGES } from '@/lib/leads/states'
import { ChevronDown, Loader2 } from 'lucide-react'

interface Props {
  customerId: string
  currentState: string
  onStateChange?: (newState: string) => void
}

export default function LeadStateSelector({ customerId, currentState, onStateChange }: Props) {
  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [state,  setState]  = useState<string>(currentState)
  const [stages, setStages] = useState<OrgStage[]>(DEFAULT_ORG_STAGES)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/pipeline-stages')
      .then(r => r.ok ? r.json() : null)
      .then((d: OrgStage[] | null) => { if (d?.length) setStages(d) })
      .catch(() => {})
  }, [])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const activeStages = stages.filter(s => s.is_active).sort((a, b) => a.position - b.position)
  const current = activeStages.find(s => s.stage_key === state) ?? { label: state, color: 'bg-gray-100 text-gray-700' }

  async function select(newState: string) {
    if (newState === state) { setOpen(false); return }
    setOpen(false)
    setSaving(true)
    const res = await fetch(`/api/customers/${customerId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState }),
    })
    setSaving(false)
    if (res.ok) {
      setState(newState)
      onStateChange?.(newState)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${current.color} ${saving ? 'opacity-50' : ''}`}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : current.label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg py-1 w-48">
          {activeStages.map(s => {
            const dotBg = s.color.split(' ')[0].replace('100', '400')
            return (
              <button
                key={s.stage_key}
                onClick={() => select(s.stage_key)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2 ${s.stage_key === state ? 'font-semibold' : ''}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${dotBg}`} />
                {s.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
