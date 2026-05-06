'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, FileText, Image as ImageIcon, ChevronRight, AlertTriangle, CheckCircle, XCircle, Car } from 'lucide-react'
import type { LeadScanResult, Confidence, ScanField } from '@/lib/leads/visionIngestTypes'
import VehiclePickerSheet from '@/components/customer/VehiclePickerSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'pick' | 'scanning' | 'confirm' | 'saving'

interface Duplicate {
  id:    string
  name:  string
  phone: string
}

interface Overrides {
  first_name?:    string
  last_name?:     string
  phone?:         string
  phone2?:        string
  email?:         string
  zip?:           string
  vehicle_year?:  number | null
  vehicle_make?:  string
  vehicle_model?: string
  vehicle_trim?:  string
  vehicle_vin?:   string
  notes?:         string
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string' && data.error.trim()) return data.error
  } catch {}

  try {
    const text = (await res.text()).trim()
    if (text) return text
  } catch {}

  return fallback
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === 'high')   return <CheckCircle  className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (confidence === 'medium') return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
  return                              <XCircle       className="h-4 w-4 text-red-500  flex-shrink-0" />
}

function ConfBanner({ overall }: { overall: Confidence }) {
  if (overall === 'high') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-600 text-sm">
        <CheckCircle className="h-4 w-4 flex-shrink-0" />
        High confidence — fields look good
      </div>
    )
  }
  if (overall === 'medium') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        Medium confidence — review highlighted fields
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-sm">
      <XCircle className="h-4 w-4 flex-shrink-0" />
      Low confidence — please verify all fields before saving
    </div>
  )
}

function Field({
  label, field, override, onEdit,
}: {
  label:    string
  field:    ScanField<string | number>
  override: string | undefined
  onEdit:   (val: string) => void
}): React.ReactElement {
  const display = String(override !== undefined ? override : (field.value ?? ''))
  const conf: Confidence = display ? field.confidence : 'low'
  return (
    <div className="flex items-center gap-2">
      <ConfBadge confidence={conf} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <input
          className="w-full bg-transparent border-b border-border text-sm py-0.5 focus:outline-none focus:border-primary"
          value={display}
          onChange={e => onEdit(e.target.value)}
          placeholder={`(${label.toLowerCase()})`}
        />
      </div>
    </div>
  ) as React.ReactElement
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeadScanner({ onClose }: { onClose?: () => void }) {
  const router    = useRouter()
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [stage,     setStage]     = useState<Stage>('pick')
  const [scan,      setScan]      = useState<LeadScanResult | null>(null)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)
  const [isPdf,     setIsPdf]     = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [sendSms,        setSendSms]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [quotaMsg,       setQuotaMsg]       = useState<string | null>(null)
  const [ignoredup,      setIgnoreDup]      = useState(false)
  const [linkVehicleId,  setLinkVehicleId]  = useState<string | null>(null)
  const [linkVehicleName,setLinkVehicleName]= useState<string | null>(null)
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false)

  function set<K extends keyof Overrides>(key: K, val: Overrides[K]) {
    setOverrides(prev => ({ ...prev, [key]: val }))
  }

  async function handleFile(file: File) {
    setError(null)
    setStage('scanning')

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch('/api/leads/scan', { method: 'POST', body: form })
      if (res.status === 429) {
        const d = await res.json()
        setQuotaMsg(`You've used all your scans this month (${d.monthly_used} of ${d.monthly_limit}). Upgrade your plan to get more.`)
        setStage('pick')
        return
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, 'Something went wrong. Please try again or use a different image.'))
        setStage('pick')
        return
      }

      const data = await res.json()
      setScan(data.scan as LeadScanResult)
      setDuplicate(data.duplicate ?? null)
      setIsPdf(data.isPdf ?? false)
      setOverrides({})
      setIgnoreDup(false)
      setStage('confirm')
    } catch {
      setError('Network error while scanning. Please try again.')
      setStage('pick')
    }
  }

  async function handleSave() {
    if (!scan) return
    setError(null)
    setStage('saving')

    try {
      const res = await fetch('/api/leads/create-from-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan, isPdf, send_intro_sms: sendSms, overrides, link_vehicle_id: linkVehicleId }),
      })

      if (!res.ok) {
        setError(await readErrorMessage(res, 'We couldn\'t save this lead. Please try again.'))
        setStage('confirm')
        return
      }

      const data = await res.json() as { customer_id?: string; status?: string }
      if (data.status === 'duplicate') {
        toast.info('Existing lead updated')
      } else {
        toast.success('New lead created')
      }
      router.push(`/customers/${data.customer_id}`)
      onClose?.()
    } catch {
      setError('Network error while saving. Please try again.')
      setStage('confirm')
    }
  }

  const scanValue = <T,>(f: ScanField<T>): T | null => f.value

  return (
    <div className="flex flex-col h-full">
      {/* ── Stage: pick ── */}
      {stage === 'pick' && (
        <div className="flex flex-col gap-4 p-4">
          {quotaMsg && (
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-700 text-sm">{quotaMsg}</div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-700 text-sm">{error}</div>
          )}
          <p className="text-sm text-muted-foreground">
            Scan a lead from a screenshot, photo, handwritten form, or PDF. AI will extract the contact info.
          </p>

          {/* Hidden file inputs */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          <button
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left"
          >
            <Camera className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Camera</p>
              <p className="text-xs text-muted-foreground">Take a photo of a form or screen</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>

          <button
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.accept = 'image/jpeg,image/png,image/webp,image/gif'
                fileRef.current.click()
              }
            }}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left"
          >
            <ImageIcon className="h-5 w-5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Photos</p>
              <p className="text-xs text-muted-foreground">Choose a screenshot or photo from device</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>

          <button
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.accept = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'
                fileRef.current.click()
              }
            }}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left"
          >
            <FileText className="h-5 w-5 text-purple-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Files</p>
              <p className="text-xs text-muted-foreground">Upload an image or PDF (credit app, online lead)</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>
        </div>
      )}

      {/* ── Stage: scanning ── */}
      {stage === 'scanning' && (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="font-medium">AI is reading your lead…</p>
          <p className="text-sm text-muted-foreground">Usually 3–5 seconds</p>
        </div>
      )}

      {/* ── Stage: confirm ── */}
      {stage === 'confirm' && scan && (
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6 pt-2">
          <ConfBanner overall={scan.overall_confidence} />

          {/* Duplicate warning */}
          {duplicate && !ignoredup && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm space-y-2">
              <p className="font-medium text-amber-700">Possible duplicate: {duplicate.name} ({duplicate.phone})</p>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/customers/${duplicate.id}`)}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg border hover:bg-accent"
                >
                  View Existing
                </button>
                <button
                  onClick={() => setIgnoreDup(true)}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
                >
                  Add Anyway
                </button>
              </div>
            </div>
          )}

          {/* Contact fields */}
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
            <Field label="First Name"  field={scan.first_name} override={overrides.first_name}  onEdit={v => set('first_name', v)} />
            <Field label="Last Name"   field={scan.last_name}  override={overrides.last_name}   onEdit={v => set('last_name', v)} />
            <Field label="Phone"       field={scan.phone}      override={overrides.phone}        onEdit={v => set('phone', v)} />
            <Field label="Alt Phone"   field={scan.phone2}     override={overrides.phone2}       onEdit={v => set('phone2', v)} />
            <Field label="Email"       field={scan.email}      override={overrides.email}        onEdit={v => set('email', v)} />
            <Field label="ZIP"         field={scan.zip}        override={overrides.zip}          onEdit={v => set('zip', v)} />
          </section>

          {/* Vehicle fields */}
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle Interest</p>
            <Field label="Year"  field={scan.vehicle_year  as ScanField<string | number>} override={overrides.vehicle_year  != null ? String(overrides.vehicle_year) : undefined} onEdit={v => set('vehicle_year', v ? Number(v) : null)} />
            <Field label="Make"  field={scan.vehicle_make}  override={overrides.vehicle_make}  onEdit={v => set('vehicle_make', v)} />
            <Field label="Model" field={scan.vehicle_model} override={overrides.vehicle_model} onEdit={v => set('vehicle_model', v)} />
            <Field label="Trim"  field={scan.vehicle_trim}  override={overrides.vehicle_trim}  onEdit={v => set('vehicle_trim', v)} />
            <Field label="VIN"   field={scan.vehicle_vin}   override={overrides.vehicle_vin}   onEdit={v => set('vehicle_vin', v)} />
          </section>

          {/* Link to inventory vehicle */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link Inventory Vehicle</p>
            <div className="flex items-center gap-2">
              {linkVehicleId && linkVehicleName ? (
                <>
                  <span className="flex-1 text-sm flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span className="text-green-700 font-medium">{linkVehicleName}</span>
                  </span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
                    onClick={() => setVehicleSheetOpen(true)}
                  >
                    Change
                  </button>
                  <button
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200"
                    onClick={() => { setLinkVehicleId(null); setLinkVehicleName(null) }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                  onClick={() => setVehicleSheetOpen(true)}
                >
                  <Car className="h-3.5 w-3.5" />+ Assign from inventory
                </button>
              )}
            </div>
          </section>

          {/* Extra signals */}
          {(scanValue(scan.notes) || scanValue(scan.trade_in) || scanValue(scan.urgency)) && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signals</p>
              {scanValue(scan.urgency) && (
                <p className="text-xs text-muted-foreground">
                  Urgency: <span className="font-medium capitalize text-foreground">{String(scan.urgency.value)}</span>
                </p>
              )}
              {scanValue(scan.trade_in) && (
                <p className="text-xs text-muted-foreground">
                  Trade-in: <span className="font-medium text-foreground">{String(scan.trade_in.value)}</span>
                </p>
              )}
              {scanValue(scan.lead_source) && (
                <p className="text-xs text-muted-foreground">
                  Source: <span className="font-medium text-foreground capitalize">{String(scan.lead_source.value)}</span>
                </p>
              )}
            </section>
          )}

          {/* Notes field */}
          <Field label="Notes" field={scan.notes} override={overrides.notes} onEdit={v => set('notes', v)} />

          {/* Intro SMS toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={e => setSendSms(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">Send intro SMS after saving</span>
          </label>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-700 text-sm">{error}</div>
          )}

          <button
            onClick={handleSave}
            disabled={!!(duplicate && !ignoredup)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Save Lead
          </button>

          <button
            onClick={() => { setScan(null); setStage('pick') }}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Scan another
          </button>

          <VehiclePickerSheet
            open={vehicleSheetOpen}
            onOpenChange={setVehicleSheetOpen}
            onSelect={(id, name) => { setLinkVehicleId(id); setLinkVehicleName(name); setVehicleSheetOpen(false) }}
          />
        </div>
      )}

      {/* ── Stage: saving ── */}
      {stage === 'saving' && (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="font-medium">Creating lead…</p>
        </div>
      )}
    </div>
  )
}
