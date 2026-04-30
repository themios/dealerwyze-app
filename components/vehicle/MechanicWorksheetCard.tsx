'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react'

interface MechanicNotes {
  oil_leaks?: string
  coolant_leaks?: string
  shift_quality?: string
  fluid_condition?: string
  trans_leaks?: string
  front_pads_mm?: string
  rear_pads_mm?: string
  smog_ready?: string
  battery?: string
  alternator?: string
  tech_recommendation?: string
  engine_codes?: string
  recommended_work?: string
  parts_estimate?: string
  labor_estimate?: string
}

interface Props {
  vehicleId: string
  canEdit: boolean
}

const TECH_REC_STYLES: Record<string, string> = {
  'retail ready':        'bg-green-50 border-green-200 dark:bg-green-950/20',
  'repair before sale':  'bg-amber-50 border-amber-200 dark:bg-amber-950/20',
  'sell wholesale':      'bg-red-50 border-red-200 dark:bg-red-950/20',
}

const TECH_REC_BADGE: Record<string, string> = {
  'retail ready':        'bg-green-100 text-green-700',
  'repair before sale':  'bg-amber-100 text-amber-700',
  'sell wholesale':      'bg-red-100 text-red-700',
}

export default function MechanicWorksheetCard({ vehicleId, canEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<MechanicNotes>({})
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/vehicles/${vehicleId}/mechanic-notes`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        const raw = data.mechanic_notes ?? {}
        const normalized: MechanicNotes = {}
        for (const k of Object.keys(raw)) {
          normalized[k as keyof MechanicNotes] = raw[k] != null ? String(raw[k]) : ''
        }
        setNotes(normalized)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [vehicleId])

  function save(updated: MechanicNotes) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/vehicles/${vehicleId}/mechanic-notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
    }, 700)
  }

  function handle(key: keyof MechanicNotes) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const updated = { ...notes, [key]: e.target.value }
      setNotes(updated)
      save(updated)
    }
  }

  const techRec = (notes.tech_recommendation ?? '').toLowerCase().trim()
  const borderStyle = TECH_REC_STYLES[techRec] ?? ''
  const badgeStyle  = TECH_REC_BADGE[techRec]

  return (
    <div className={`border rounded-xl overflow-hidden ${borderStyle}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Mechanic Worksheet</span>
          {badgeStyle && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${badgeStyle}`}>
              {techRec}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && !loading && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">

          {/* Compact grid — short text fields */}
          <div className="grid grid-cols-3 gap-2">
            <Inline label="Oil Leaks"       hint="none/minor/major" value={notes.oil_leaks}       onChange={handle('oil_leaks')}       disabled={!canEdit} />
            <Inline label="Coolant Leaks"   hint="none/minor/major" value={notes.coolant_leaks}   onChange={handle('coolant_leaks')}   disabled={!canEdit} />
            <Inline label="Trans Leaks"     hint="none/minor/major" value={notes.trans_leaks}     onChange={handle('trans_leaks')}     disabled={!canEdit} />
            <Inline label="Shift Quality"   hint="good/fair/poor"   value={notes.shift_quality}   onChange={handle('shift_quality')}   disabled={!canEdit} />
            <Inline label="Fluid Condition" hint="clean/dark/burnt" value={notes.fluid_condition} onChange={handle('fluid_condition')} disabled={!canEdit} />
            <Inline label="Smog"            hint="ready/not ready"  value={notes.smog_ready}      onChange={handle('smog_ready')}      disabled={!canEdit} />
            <Inline label="Battery"         hint="pass/fail"        value={notes.battery}         onChange={handle('battery')}         disabled={!canEdit} />
            <Inline label="Alternator"      hint="pass/fail"        value={notes.alternator}      onChange={handle('alternator')}      disabled={!canEdit} />
            <Inline label="Tech Rec"        hint="retail/repair/wholesale" value={notes.tech_recommendation} onChange={handle('tech_recommendation')} disabled={!canEdit} />
          </div>

          {/* Brake pads — numeric */}
          <div className="grid grid-cols-2 gap-2">
            <Inline label="Front Pads (mm)" hint="e.g. 6" value={notes.front_pads_mm} onChange={handle('front_pads_mm')} disabled={!canEdit} type="number" />
            <Inline label="Rear Pads (mm)"  hint="e.g. 5" value={notes.rear_pads_mm}  onChange={handle('rear_pads_mm')}  disabled={!canEdit} type="number" />
          </div>

          {/* Estimates */}
          <div className="grid grid-cols-2 gap-2">
            <Inline label="Parts ($)"  hint="0.00" value={notes.parts_estimate} onChange={handle('parts_estimate')} disabled={!canEdit} type="number" />
            <Inline label="Labor ($)"  hint="0.00" value={notes.labor_estimate} onChange={handle('labor_estimate')} disabled={!canEdit} type="number" />
          </div>

          {/* OBD codes */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Engine Codes</p>
            <input
              type="text"
              value={notes.engine_codes ?? ''}
              onChange={handle('engine_codes')}
              disabled={!canEdit}
              placeholder="P0xxx, notes..."
              className="w-full rounded-md border px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
          </div>

          {/* Recommended work */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Recommended Work</p>
            <textarea
              value={notes.recommended_work ?? ''}
              onChange={handle('recommended_work')}
              disabled={!canEdit}
              placeholder="Repairs, parts, notes..."
              rows={3}
              className="w-full rounded-md border px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-60"
            />
          </div>

        </div>
      )}
    </div>
  )
}

function Inline({ label, hint, value, onChange, disabled, type = 'text' }: {
  label: string
  hint: string
  value?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
  type?: string
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5 leading-tight">{label}</p>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        placeholder={hint}
        min={type === 'number' ? '0' : undefined}
        className="w-full rounded-md border px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 placeholder:text-muted-foreground/50"
      />
    </div>
  )
}
