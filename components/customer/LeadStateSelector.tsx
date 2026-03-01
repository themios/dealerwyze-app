'use client'

import { useState, useRef, useEffect } from 'react'
import { LEAD_STATES, LEAD_STATE_CONFIG, type LeadState } from '@/lib/leads/states'
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
  const ref = useRef<HTMLDivElement>(null)

  const cfg = LEAD_STATE_CONFIG[state as LeadState] ?? { label: state, color: 'bg-gray-100 text-gray-500' }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

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
    } else if (res.status === 409) {
      // Backward transition blocked — state stays unchanged, no UI desync
    }
    // Other errors: state stays unchanged (DB not modified)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${cfg.color} ${saving ? 'opacity-50' : ''}`}
        disabled={saving}
      >
        {saving
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : cfg.label
        }
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg py-1 w-44">
          {LEAD_STATES.map(s => {
            const c = LEAD_STATE_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => select(s)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2 ${s === state ? 'font-semibold' : ''}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${c.color.split(' ')[0]}`} />
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
