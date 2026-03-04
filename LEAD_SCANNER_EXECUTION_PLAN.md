# DealerWyze — Visual Lead Scanner: Execution Plan

**Version:** 1.0
**Date:** 2026-03-03
**Reference PRD:** `LEAD_SCANNER_PRD.md`
**Pattern to follow:** `lib/contacts/vision.ts` + `app/api/contacts/scan/route.ts` + `app/(app)/contacts/page.tsx`

---

## Summary of Changes

| Type | File | Action |
|------|------|--------|
| New lib | `lib/leads/visionIngest.ts` | Vision extraction + ParsedLead output |
| New API | `app/api/leads/scan/route.ts` | Accepts image or PDF, returns extracted lead |
| New component | `components/leads/LeadScanner.tsx` | Camera/upload + confirm sheet |
| Modified | `app/(app)/customers/page.tsx` | Add "Scan Lead" button |
| Modified | `types/index.ts` | Add `LeadScanResult` type |
| No DB changes | — | Reuses existing `customers`, `vehicles`, `activities` tables |

**No new migrations required.** The scanner feeds into the existing
`ingestLead()` pipeline. All existing duplicate detection and customer
creation logic is reused unchanged.

---

## File 1 — `lib/leads/visionIngest.ts`

The core extraction module. Mirrors `lib/contacts/vision.ts` exactly in structure.

```typescript
import Anthropic from '@anthropic-ai/sdk'

// ── Output types ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface LeadScanField<T = string | null> {
  value: T
  confidence: ConfidenceLevel
}

export interface LeadScanResult {
  // Customer identity
  first_name:       LeadScanField
  last_name:        LeadScanField
  phone:            LeadScanField
  phone2:           LeadScanField
  email:            LeadScanField
  city:             LeadScanField
  state:            LeadScanField
  zip:              LeadScanField

  // Vehicle of interest
  vehicle_year:     LeadScanField<number | null>
  vehicle_make:     LeadScanField
  vehicle_model:    LeadScanField
  vehicle_trim:     LeadScanField
  vehicle_vin:      LeadScanField
  budget:           LeadScanField<number | null>

  // Lead context
  source:           LeadScanField
  notes:            LeadScanField
  has_trade_in:     LeadScanField<boolean | null>
  trade_in_desc:    LeadScanField
  urgency:          LeadScanField  // 'ready_now' | 'this_week' | 'browsing' | null

  // Overall quality
  overall_confidence: ConfidenceLevel
  scan_notes:         string | null  // e.g. "Image was blurry — verify phone number"
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a lead data extraction engine for a used-car dealership CRM.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.
Extract lead information from any source: screenshots, photos, business cards, PDFs, application forms, text conversations, or handwritten notes.`

const USER_PROMPT = `Extract all customer and vehicle information from this image or document.

OUTPUT a single JSON object with these EXACT fields.
For each field, provide: { "value": <extracted value or null>, "confidence": "high"|"medium"|"low" }
Use "high" when the text is clearly visible, "medium" when partially readable or inferred, "low" when guessed.

{
  "first_name":        { "value": "string or null",  "confidence": "high|medium|low" },
  "last_name":         { "value": "string or null",  "confidence": "high|medium|low" },
  "phone":             { "value": "string or null",  "confidence": "high|medium|low" },
  "phone2":            { "value": "string or null",  "confidence": "high|medium|low" },
  "email":             { "value": "string or null",  "confidence": "high|medium|low" },
  "city":              { "value": "string or null",  "confidence": "high|medium|low" },
  "state":             { "value": "string or null",  "confidence": "high|medium|low" },
  "zip":               { "value": "string or null",  "confidence": "high|medium|low" },
  "vehicle_year":      { "value": number or null,    "confidence": "high|medium|low" },
  "vehicle_make":      { "value": "string or null",  "confidence": "high|medium|low" },
  "vehicle_model":     { "value": "string or null",  "confidence": "high|medium|low" },
  "vehicle_trim":      { "value": "string or null",  "confidence": "high|medium|low" },
  "vehicle_vin":       { "value": "string or null",  "confidence": "high|medium|low" },
  "budget":            { "value": number or null,    "confidence": "high|medium|low" },
  "source":            { "value": "facebook|cargurus|autotrader|offerup|walk_in|web_form|text_referral|referral|other", "confidence": "high|medium|low" },
  "notes":             { "value": "string or null",  "confidence": "high|medium|low" },
  "has_trade_in":      { "value": true|false|null,   "confidence": "high|medium|low" },
  "trade_in_desc":     { "value": "string or null",  "confidence": "high|medium|low" },
  "urgency":           { "value": "ready_now|this_week|browsing or null", "confidence": "high|medium|low" },
  "overall_confidence": "high|medium|low",
  "scan_notes": "string or null — note anything the user should verify or that was unclear"
}

RULES:
- phone: primary contact number. Preserve formatting as printed.
- phone2: secondary number only if a second distinct number is visible.
- budget: extract as integer USD (e.g. 22000 for "$22k" or "$22,000").
- vehicle_year: integer (e.g. 2021), not a string.
- source: infer from visible branding, logos, URL fragments, or document style.
  Facebook/Messenger = "facebook", handwritten paper = "walk_in",
  SMS screenshot = "text_referral", business card = "referral".
- urgency: "ready_now" if they say "ready to buy", "this_week" for near-term,
  "browsing" if casual interest. null if unclear.
- notes: any customer message, questions, or comments visible in the image.
- overall_confidence: "high" if name+phone extracted confidently,
  "medium" if name OR phone missing/uncertain, "low" if most fields empty.
- scan_notes: practical note for the dealer, e.g. "Phone number partially cut off — verify last digit".
- If a field is not present, use null for value.`

// ── Image extraction ─────────────────────────────────────────────────────────

export async function scanLeadImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<LeadScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: imageBase64 },
        },
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  })

  return parseResponse(response.content[0])
}

// ── PDF extraction ────────────────────────────────────────────────────────────

export async function scanLeadPdf(
  pdfBase64: string,
): Promise<LeadScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Use Sonnet for PDFs — more reliable with multi-page documents
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  })

  return parseResponse(response.content[0])
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseResponse(block: Anthropic.ContentBlock): LeadScanResult {
  const text = block.type === 'text' ? block.text : ''
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in response: ${text.slice(0, 200)}`)
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as LeadScanResult
  } catch {
    throw new Error(`Invalid JSON from model: ${text.slice(start, start + 200)}`)
  }
}

// ── Conversion: LeadScanResult → ParsedLead (for ingestLead()) ───────────────

import type { ParsedLead, LeadSource } from '@/lib/leads/parser'

export function scanResultToParsedLead(scan: LeadScanResult): ParsedLead {
  const firstName = scan.first_name.value ?? ''
  const lastName  = scan.last_name.value  ?? ''
  const year      = scan.vehicle_year.value
  const make      = scan.vehicle_make.value ?? ''
  const model     = scan.vehicle_model.value ?? ''
  const trim      = scan.vehicle_trim.value ?? ''

  const vehicleParts = [year, make, model, trim].filter(Boolean)
  const vehicleStr   = vehicleParts.join(' ')

  const sourceMap: Record<string, LeadSource> = {
    facebook:      'facebook',
    cargurus:      'cargurus',
    autotrader:    'autotrader',
    offerup:       'offerup',
    walk_in:       'other',
    web_form:      'other',
    text_referral: 'other',
    referral:      'other',
    other:         'other',
  }

  return {
    name:         `${firstName} ${lastName}`.trim() || 'Unknown',
    email:        scan.email.value ?? '',
    phone:        scan.phone.value ?? '',
    zip:          scan.zip.value ?? '',
    vehicle:      vehicleStr,
    vin:          scan.vehicle_vin.value ?? '',
    listed_price: scan.budget.value ?? null,
    comments:     scan.notes.value ?? '',
    source:       sourceMap[scan.source.value ?? 'other'] ?? 'other',
    raw_text:     `[Visual scan] ${scan.scan_notes ?? ''}`,
  }
}
```

---

## File 2 — `app/api/leads/scan/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requireOrgAccess } from '@/lib/auth/requireOrgAccess'
import { scanLeadImage, scanLeadPdf } from '@/lib/leads/visionIngest'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 45  // PDFs can take longer than images

const SUPPORTED_IMAGES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
])

/**
 * POST /api/leads/scan
 * Body JSON: { file_base64: string, mime_type: string }
 * Returns: LeadScanResult + duplicate check result
 * Does NOT save anything — caller confirms first.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await requireProfile().catch(() => null)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await requireOrgAccess(profile)

  const body = await req.json() as { file_base64?: string; mime_type?: string }
  if (!body.file_base64 || !body.mime_type) {
    return NextResponse.json({ error: 'file_base64 and mime_type required' }, { status: 400 })
  }

  const isImage = SUPPORTED_IMAGES.has(body.mime_type)
  const isPdf   = body.mime_type === 'application/pdf'

  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: 'Supported types: JPEG, PNG, WebP, GIF, PDF' },
      { status: 400 }
    )
  }

  // Basic file size guard (base64 ~= 1.37× raw; 10 MB raw → ~14 MB base64)
  if (body.file_base64.length > 14_000_000) {
    return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 })
  }

  try {
    const scan = isPdf
      ? await scanLeadPdf(body.file_base64)
      : await scanLeadImage(
          body.file_base64,
          body.mime_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        )

    // Duplicate check — run against this org's customers
    const supabase = createServiceClient()
    let duplicate: { id: string; name: string; last_activity: string | null } | null = null

    const phone = scan.phone.value?.replace(/\D/g, '') ?? ''
    const email = scan.email.value ?? ''

    if (phone.length >= 7) {
      const digits = phone.length === 11 && phone.startsWith('1') ? phone.slice(1) : phone
      const { data: phoneMatch } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('user_id', profile.org_id)
        .or(`primary_phone.ilike.%${digits}%,secondary_phone.ilike.%${digits}%`)
        .limit(1)
        .maybeSingle()
      if (phoneMatch) {
        duplicate = {
          id:            phoneMatch.id,
          name:          `${phoneMatch.first_name ?? ''} ${phoneMatch.last_name ?? ''}`.trim(),
          last_activity: null,
        }
      }
    }

    if (!duplicate && email) {
      const { data: emailMatch } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('user_id', profile.org_id)
        .eq('email', email)
        .limit(1)
        .maybeSingle()
      if (emailMatch) {
        duplicate = {
          id:            emailMatch.id,
          name:          `${emailMatch.first_name ?? ''} ${emailMatch.last_name ?? ''}`.trim(),
          last_activity: null,
        }
      }
    }

    return NextResponse.json({ scan, duplicate })

  } catch (err) {
    console.error('[leads/scan] error:', err)
    return NextResponse.json(
      { error: 'Scan failed — try a clearer image or different file' },
      { status: 500 }
    )
  }
}
```

---

## File 3 — `components/leads/LeadScanner.tsx`

Full client component. Mirrors the contacts scanner UI pattern.

```typescript
'use client'

import { useState, useRef } from 'react'
import {
  ScanLine, Camera, FileUp, Loader2, AlertCircle,
  CheckCircle2, AlertTriangle, X, ChevronRight,
} from 'lucide-react'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { Label }   from '@/components/ui/label'
import { cn }      from '@/lib/utils'
import type { LeadScanResult, ConfidenceLevel } from '@/lib/leads/visionIngest'

// ── Types ────────────────────────────────────────────────────────────────────

interface Duplicate {
  id: string
  name: string
  last_activity: string | null
}

interface ScanResponse {
  scan: LeadScanResult
  duplicate: Duplicate | null
}

// Editable form fields (flat — extracted from LeadScanResult for editing)
interface LeadForm {
  first_name:    string
  last_name:     string
  phone:         string
  phone2:        string
  email:         string
  city:          string
  state:         string
  zip:           string
  vehicle_year:  string
  vehicle_make:  string
  vehicle_model: string
  vehicle_trim:  string
  vehicle_vin:   string
  budget:        string
  source:        string
  notes:         string
  has_trade_in:  boolean
  trade_in_desc: string
  send_intro_sms: boolean
}

function scanToForm(scan: LeadScanResult): LeadForm {
  return {
    first_name:    scan.first_name.value    ?? '',
    last_name:     scan.last_name.value     ?? '',
    phone:         scan.phone.value         ?? '',
    phone2:        scan.phone2.value        ?? '',
    email:         scan.email.value         ?? '',
    city:          scan.city.value          ?? '',
    state:         scan.state.value         ?? '',
    zip:           scan.zip.value           ?? '',
    vehicle_year:  scan.vehicle_year.value  ? String(scan.vehicle_year.value) : '',
    vehicle_make:  scan.vehicle_make.value  ?? '',
    vehicle_model: scan.vehicle_model.value ?? '',
    vehicle_trim:  scan.vehicle_trim.value  ?? '',
    vehicle_vin:   scan.vehicle_vin.value   ?? '',
    budget:        scan.budget.value        ? String(scan.budget.value) : '',
    source:        scan.source.value        ?? 'other',
    notes:         scan.notes.value         ?? '',
    has_trade_in:  scan.has_trade_in.value  ?? false,
    trade_in_desc: scan.trade_in_desc.value ?? '',
    send_intro_sms: true,
  }
}

// ── Confidence badge ─────────────────────────────────────────────────────────

function ConfBadge({ level }: { level: ConfidenceLevel }) {
  if (level === 'high')   return <CheckCircle2  className="h-3.5 w-3.5 text-green-500 shrink-0" />
  if (level === 'medium') return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
  return                         <AlertCircle   className="h-3.5 w-3.5 text-red-500 shrink-0" />
}

// ── Confidence banner text ────────────────────────────────────────────────────

function ConfBanner({ level, notes }: { level: ConfidenceLevel; notes: string | null }) {
  const map = {
    high:   { text: 'Looks good — verify and save',       cls: 'bg-green-50  text-green-800  border-green-200'  },
    medium: { text: 'Please review highlighted fields',    cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
    low:    { text: 'Partial scan — fill in what\'s missing', cls: 'bg-red-50 text-red-800 border-red-200' },
  }
  const { text, cls } = map[level]
  return (
    <div className={cn('rounded-lg border px-3 py-2 text-sm', cls)}>
      <p className="font-medium">{text}</p>
      {notes && <p className="text-xs mt-0.5 opacity-80">{notes}</p>}
    </div>
  )
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  label, name, value, confidence, onChange, type = 'text',
}: {
  label: string
  name: string
  value: string
  confidence: ConfidenceLevel
  onChange: (name: string, value: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={name} className="text-xs text-muted-foreground">{label}</Label>
        <ConfBadge level={confidence} />
      </div>
      <Input
        id={name}
        type={type}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        className={cn(
          'text-sm h-9',
          confidence === 'low' && 'border-red-300 focus-visible:ring-red-300',
          confidence === 'medium' && 'border-yellow-300 focus-visible:ring-yellow-300',
        )}
      />
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface LeadScannerProps {
  onSaved: (customerId: string) => void
  onCancel: () => void
}

type Stage = 'pick' | 'scanning' | 'confirm' | 'saving'

export function LeadScanner({ onSaved, onCancel }: LeadScannerProps) {
  const [stage,     setStage]     = useState<Stage>('pick')
  const [scanData,  setScanData]  = useState<ScanResponse | null>(null)
  const [form,      setForm]      = useState<LeadForm | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [skipDup,   setSkipDup]   = useState(false)
  const imgInputRef  = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function setField(name: string, value: string) {
    setForm(f => f ? { ...f, [name]: value } : f)
  }

  async function handleFile(file: File) {
    setError(null)
    setStage('scanning')

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload  = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })

      const resp = await fetch('/api/leads/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_base64: base64, mime_type: file.type }),
      })

      if (!resp.ok) {
        const e = await resp.json()
        throw new Error(e.error ?? 'Scan failed')
      }

      const data: ScanResponse = await resp.json()
      setScanData(data)
      setForm(scanToForm(data.scan))
      setStage('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed — try again')
      setStage('pick')
    }
  }

  async function handleSave() {
    if (!form) return
    setStage('saving')

    try {
      const resp = await fetch('/api/leads/create-from-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, send_intro_sms: form.send_intro_sms }),
      })
      if (!resp.ok) {
        const e = await resp.json()
        throw new Error(e.error ?? 'Save failed')
      }
      const { customer_id } = await resp.json()
      onSaved(customer_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setStage('confirm')
    }
  }

  // ── Stage: pick ─────────────────────────────────────────────────────────────

  if (stage === 'pick') return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary" /> Scan Lead
        </h2>
        <button onClick={onCancel} className="text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <p className="text-sm text-muted-foreground">
        Take a photo or upload any image or PDF containing lead information —
        screenshots, business cards, application forms, text conversations, or printed docs.
      </p>

      {/* Camera — rear camera, mobile only */}
      <Button
        className="w-full gap-2"
        onClick={() => imgInputRef.current?.click()}
      >
        <Camera className="h-4 w-4" /> Take Photo
      </Button>
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {/* File picker — images + PDF */}
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className="h-4 w-4" /> Upload Image or PDF
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  )

  // ── Stage: scanning ─────────────────────────────────────────────────────────

  if (stage === 'scanning') return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-48">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Scanning for lead info…</p>
    </div>
  )

  // ── Stage: confirm ──────────────────────────────────────────────────────────

  if (stage === 'confirm' && scanData && form) {
    const { scan, duplicate } = scanData

    return (
      <div className="flex flex-col gap-4 p-4 pb-8 overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Confirm Lead</h2>
          <button onClick={onCancel}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <ConfBanner level={scan.overall_confidence} notes={scan.scan_notes} />

        {/* Duplicate warning */}
        {duplicate && !skipDup && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm space-y-2">
            <p className="font-medium text-yellow-800">Possible duplicate: {duplicate.name}</p>
            <p className="text-yellow-700 text-xs">A customer with this phone or email already exists.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"
                onClick={() => window.location.href = `/customers/${duplicate.id}`}>
                View Existing
              </Button>
              <Button size="sm" variant="ghost"
                className="text-yellow-700"
                onClick={() => setSkipDup(true)}>
                Add Anyway
              </Button>
            </div>
          </div>
        )}

        {/* Customer fields */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="First Name" name="first_name" value={form.first_name}
              confidence={scan.first_name.confidence} onChange={setField} />
            <FieldRow label="Last Name"  name="last_name"  value={form.last_name}
              confidence={scan.last_name.confidence}  onChange={setField} />
          </div>
          <FieldRow label="Phone"  name="phone"  value={form.phone}
            confidence={scan.phone.confidence}  onChange={setField} type="tel" />
          <FieldRow label="Phone 2 (optional)" name="phone2" value={form.phone2}
            confidence={scan.phone2.confidence} onChange={setField} type="tel" />
          <FieldRow label="Email"  name="email"  value={form.email}
            confidence={scan.email.confidence}  onChange={setField} type="email" />
          <div className="grid grid-cols-3 gap-2">
            <FieldRow label="City"  name="city"  value={form.city}
              confidence={scan.city.confidence}  onChange={setField} />
            <FieldRow label="State" name="state" value={form.state}
              confidence={scan.state.confidence} onChange={setField} />
            <FieldRow label="ZIP"   name="zip"   value={form.zip}
              confidence={scan.zip.confidence}   onChange={setField} />
          </div>
        </div>

        {/* Vehicle fields */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle of Interest</p>
          <div className="grid grid-cols-3 gap-2">
            <FieldRow label="Year"  name="vehicle_year"  value={form.vehicle_year}
              confidence={scan.vehicle_year.confidence}  onChange={setField} />
            <FieldRow label="Make"  name="vehicle_make"  value={form.vehicle_make}
              confidence={scan.vehicle_make.confidence}  onChange={setField} />
            <FieldRow label="Model" name="vehicle_model" value={form.vehicle_model}
              confidence={scan.vehicle_model.confidence} onChange={setField} />
          </div>
          <FieldRow label="Trim (optional)" name="vehicle_trim" value={form.vehicle_trim}
            confidence={scan.vehicle_trim.confidence} onChange={setField} />
          <FieldRow label="Budget" name="budget" value={form.budget}
            confidence={scan.budget.confidence} onChange={setField} type="number" />
        </div>

        {/* Lead context */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead Context</p>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <select
              value={form.source}
              onChange={e => setField('source', e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              {[
                ['facebook',      'Facebook Marketplace'],
                ['cargurus',      'CarGurus'],
                ['autotrader',    'AutoTrader'],
                ['offerup',       'OfferUp'],
                ['walk_in',       'Walk-In'],
                ['web_form',      'Online Application'],
                ['text_referral', 'Text / SMS'],
                ['referral',      'Referral'],
                ['other',         'Other'],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes / Message</Label>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        {/* Send intro SMS toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.send_intro_sms}
            onChange={e => setForm(f => f ? { ...f, send_intro_sms: e.target.checked } : f)}
            className="rounded"
          />
          Send intro text after saving
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <Button className="w-full gap-2" onClick={handleSave}>
          <ChevronRight className="h-4 w-4" /> Save Lead
        </Button>
      </div>
    )
  }

  // ── Stage: saving ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-48">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Saving lead…</p>
    </div>
  )
}
```

---

## File 4 — `app/api/leads/create-from-scan/route.ts`

Takes the confirmed form data and creates the customer record via existing `ingestLead()`.

```typescript
import { NextRequest, NextResponse }  from 'next/server'
import { requireProfile }             from '@/lib/auth/profile'
import { requireOrgAccess }           from '@/lib/auth/requireOrgAccess'
import { ingestLead }                 from '@/lib/leads/ingest'
import { sendSms }                    from '@/lib/twilio/sms'
import { getOrgSettings }             from '@/lib/orgs/settings'
import type { LeadForm }              from '@/components/leads/LeadScanner'  // re-export type
import type { ParsedLead }            from '@/lib/leads/parser'

export const maxDuration = 20

export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await requireProfile().catch(() => null)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await requireOrgAccess(profile)

  const { form, send_intro_sms } = await req.json() as {
    form: LeadForm
    send_intro_sms: boolean
  }

  // Build ParsedLead from the confirmed form
  const vehicleParts = [
    form.vehicle_year, form.vehicle_make, form.vehicle_model, form.vehicle_trim,
  ].filter(Boolean)

  const parsed: ParsedLead = {
    name:         `${form.first_name} ${form.last_name}`.trim() || 'Unknown',
    email:        form.email,
    phone:        form.phone,
    zip:          form.zip,
    vehicle:      vehicleParts.join(' '),
    vin:          form.vehicle_vin,
    listed_price: form.budget ? parseInt(form.budget, 10) : null,
    comments:     form.notes,
    source:       form.source as ParsedLead['source'],
    raw_text:     '[Lead Scanner import]',
  }

  // Use a unique external_id based on timestamp + phone to prevent double-saves
  const external_id = `scan_${Date.now()}_${form.phone.replace(/\D/g, '')}`

  const result = await ingestLead(parsed, external_id, profile.org_id)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.reason ?? 'Save failed' }, { status: 500 })
  }

  const customerId = result.customer_id

  // Send intro SMS if requested (and customer has a phone number)
  if (send_intro_sms && form.phone && customerId) {
    try {
      const orgSettings = await getOrgSettings(profile.org_id)
      if (orgSettings?.twilio_phone_number) {
        const dealerName = orgSettings.business_name ?? 'us'
        const firstName  = form.first_name || 'there'
        const vehicle    = vehicleParts.join(' ')
        const body = vehicle
          ? `Hi ${firstName}, thanks for your interest in the ${vehicle}! I'd love to help. — ${dealerName}`
          : `Hi ${firstName}, thanks for reaching out! I'd love to help you find the right vehicle. — ${dealerName}`

        await sendSms({
          to:   form.phone,
          from: orgSettings.twilio_phone_number,
          body,
          orgId: profile.org_id,
          customerId,
        })
      }
    } catch (err) {
      // SMS failure doesn't fail the save
      console.error('[leads/create-from-scan] intro SMS error:', err)
    }
  }

  return NextResponse.json({ customer_id: customerId, status: result.status })
}
```

---

## File 5 — Wire into `app/(app)/customers/page.tsx`

Add the "Scan Lead" button next to the existing "+" button.

```typescript
// Add to imports:
import { LeadScanner } from '@/components/leads/LeadScanner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

// Add to state:
const [scanOpen, setScanOpen] = useState(false)

// Add alongside the existing new-customer "+" button in the TopBar actions:
<Button
  size="sm"
  variant="outline"
  className="gap-1.5"
  onClick={() => setScanOpen(true)}
>
  <ScanLine className="h-4 w-4" />
  <span className="hidden sm:inline">Scan Lead</span>
</Button>

// Add Sheet at the bottom of the component:
<Sheet open={scanOpen} onOpenChange={setScanOpen}>
  <SheetContent side="bottom" className="h-[92vh] p-0 rounded-t-2xl overflow-y-auto">
    <LeadScanner
      onSaved={(customerId) => {
        setScanOpen(false)
        router.push(`/customers/${customerId}`)
      }}
      onCancel={() => setScanOpen(false)}
    />
  </SheetContent>
</Sheet>
```

---

## Type export (add to `types/index.ts`)

```typescript
// Re-export for use across the app
export type { LeadScanResult, LeadScanField, ConfidenceLevel } from '@/lib/leads/visionIngest'
```

---

## Checklist

### Phase 1 — Core extraction library
- 🔲 Create `lib/leads/visionIngest.ts`
- 🔲 Implement `scanLeadImage()` (Haiku — images)
- 🔲 Implement `scanLeadPdf()` (Sonnet — PDFs)
- 🔲 Implement `parseResponse()` helper
- 🔲 Implement `scanResultToParsedLead()` converter
- 🔲 Test with a clear CarGurus screenshot — verify JSON extraction
- 🔲 Test with a handwritten form photo — verify graceful partial extraction
- 🔲 Test with a PDF credit application — verify PDF document block works
- 🔲 Test with a blurry/bad image — verify `overall_confidence: 'low'` returned cleanly

### Phase 2 — API routes
- 🔲 Create `app/api/leads/scan/route.ts`
- 🔲 Test image upload (JPEG + PNG + WebP)
- 🔲 Test PDF upload
- 🔲 Test file size rejection (>10 MB)
- 🔲 Test duplicate detection fires when matching phone exists
- 🔲 Create `app/api/leads/create-from-scan/route.ts`
- 🔲 Test save creates customer + vehicle record via `ingestLead()`
- 🔲 Test intro SMS fires when `send_intro_sms: true` and org has Twilio number
- 🔲 Test intro SMS skipped gracefully when org has no Twilio number

### Phase 3 — UI component
- 🔲 Create `components/leads/LeadScanner.tsx`
- 🔲 Stage: `pick` — Camera button + file picker render correctly
- 🔲 Stage: `scanning` — spinner shows during API call
- 🔲 Stage: `confirm` — all fields render with confidence badges
- 🔲 Duplicate warning banner shows with "View Existing" + "Add Anyway"
- 🔲 Confidence banner shows correct text for high/medium/low
- 🔲 Low-confidence fields have yellow/red border styling
- 🔲 "Send intro text" toggle is checked by default, works when unchecked
- 🔲 Stage: `saving` — spinner shows during save
- 🔲 On success → redirects to customer detail page
- 🔲 On error → shows error message, stays on confirm screen

### Phase 4 — Integration
- 🔲 Wire "Scan Lead" button into `app/(app)/customers/page.tsx`
- 🔲 Sheet opens/closes correctly on mobile
- 🔲 `ScanLine` icon imported from lucide-react (already in dep)
- 🔲 Add `LeadScanResult` type export to `types/index.ts`

### Phase 5 — End-to-end tests
- 🔲 Facebook Marketplace screenshot → correct source detected, name + phone extracted
- 🔲 CarGurus lead email screenshot → source = cargurus, vehicle extracted
- 🔲 Handwritten form photo → partial extraction, `overall_confidence: low`, `scan_notes` present
- 🔲 PDF credit application → all name/phone/email fields extracted
- 🔲 Business card → name + phone extracted, `source: referral`
- 🔲 Duplicate customer → warning banner shows, "View Existing" navigates correctly
- 🔲 "Add Anyway" skips duplicate warning, saves new record
- 🔲 Intro SMS text sent after save, appears in customer activity feed

---

## No New Dependencies Required

| Need | How satisfied |
|------|---------------|
| Vision AI | `@anthropic-ai/sdk` already installed |
| PDF support | Anthropic API `document` block — no extra lib |
| Camera access | Native browser `capture="environment"` attribute |
| File reading | Native `FileReader` API |
| SMS after save | `lib/twilio/sms.ts` already exists |
| Duplicate check | Supabase query in route (no new lib) |
| UI sheet | `@/components/ui/sheet` already in shadcn |

**Zero new npm packages needed.**
