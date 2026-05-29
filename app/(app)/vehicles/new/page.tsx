'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { useVertical } from '@/hooks/useVertical'

function deriveStockNo(vin: string): string {
  const clean = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase()
  return clean.length >= 6 ? clean.slice(-6) : ''
}

function NewVehicleForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [vinDecoding, setVinDecoding] = useState(false)
  const [vinDecoded, setVinDecoded] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    stock_no: deriveStockNo(searchParams.get('vin') || ''),
    year: searchParams.get('year') || new Date().getFullYear().toString(),
    make: searchParams.get('make') || '',
    model: searchParams.get('model') || '',
    trim: searchParams.get('trim') || '',
    color: searchParams.get('color') || '',
    mileage: searchParams.get('mileage') || '',
    price: '',
    vin: searchParams.get('vin') || '',
    status: searchParams.get('status') || 'available',
    notes: searchParams.get('notes') || '',
    purchase_price: searchParams.get('purchase_price') || '',
    purchased_from: searchParams.get('purchased_from') || '',
    purchased_at: searchParams.get('purchased_at') || '',
    acquisition_source: searchParams.get('acquisition_source') || '',
    auction_name: searchParams.get('auction_name') || '',
    auction_lot: searchParams.get('auction_lot') || '',
    acquisition_notes: searchParams.get('acquisition_notes') || '',
  })
  const derivedStockNo = deriveStockNo(form.vin)
  const finalStockNo = derivedStockNo || form.stock_no

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function decodeVin(vin: string) {
    const clean = vin.trim().toUpperCase()
    if (clean.length !== 17) return
    setVinDecoding(true)
    setVinDecoded(false)
    try {
      const res = await fetch('/api/vehicles/intake/vin-decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin: clean }),
      })
      if (!res.ok) return
      const data = await res.json()
      setForm(prev => ({
        ...prev,
        vin: clean,
        year:  data.year  ? String(data.year)  : prev.year,
        make:  data.make  || prev.make,
        model: data.model || prev.model,
        trim:  data.trim  || prev.trim,
      }))
      setVinDecoded(true)
    } catch {
      // best-effort — leave fields as-is
    } finally {
      setVinDecoding(false)
    }
  }

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setScanMessage({ type: 'error', text: 'Select an image file (JPG, PNG, HEIC, etc.).' })
      return
    }
    setScanning(true)
    setScanMessage(null)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/vehicles/intake/scan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScanMessage({ type: 'error', text: data.error || 'Scan failed. Try a clearer photo.' })
        return
      }
      setForm(prev => ({
        ...prev,
        vin:     data.vin    || prev.vin,
        year:    data.year   ? String(data.year)    : prev.year,
        make:    data.make   || prev.make,
        model:   data.model  || prev.model,
        trim:    data.trim   || prev.trim,
        mileage: data.mileage ? String(data.mileage) : prev.mileage,
      }))
      setScanMessage({ type: 'success', text: 'Vehicle info extracted. Review the fields below before saving.' })
    } catch {
      setScanMessage({ type: 'error', text: 'Could not read the image. Try a different file.' })
    } finally {
      setScanning(false)
      if (scanInputRef.current) scanInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!finalStockNo || !form.year || !form.make || !form.model) return
    setSaving(true)

    // Free tier cap: 100 vehicles
    const { count } = await supabase.from('vehicles').select('id', { count: 'exact', head: true })
    if ((count ?? 0) >= 100) {
      setSaving(false)
      alert('You\'ve reached the 100-vehicle limit for the free beta tier. Contact support@dealerwyze.com if you need more.')
      return
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        stock_no: finalStockNo,
        year: parseInt(form.year),
        make: form.make,
        model: form.model,
        trim: form.trim || null,
        color: form.color || null,
        mileage: form.mileage ? parseInt(form.mileage) : null,
        price: form.price ? parseFloat(form.price) : null,
        vin: form.vin || null,
        status: form.status,
        notes: form.notes || null,
        purchase_price: form.status === 'staging' && form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchased_from: form.status === 'staging' && form.purchased_from ? form.purchased_from : null,
        purchased_at: form.status === 'staging' && form.purchased_at ? form.purchased_at : null,
        acquisition_source: form.status === 'staging' && form.acquisition_source ? form.acquisition_source : null,
        auction_name: form.status === 'staging' && form.auction_name ? form.auction_name : null,
        auction_lot: form.status === 'staging' && form.auction_lot ? form.auction_lot : null,
        acquisition_notes: form.status === 'staging' && form.acquisition_notes ? form.acquisition_notes : null,
      })
      .select('id')
      .single()

    if (data) {
      // Seed recon checklist for staging vehicles
      if (form.status === 'staging') {
        try {
          await fetch(`/api/vehicles/${data.id}/recon/seed`, { method: 'POST' })
        } catch {
          // best-effort — don't block navigation
        }
      }
      router.push(`/vehicles/${data.id}`)
    } else {
      setSaving(false)
      console.error(error)
    }
  }

  return (
    <div>
      <TopBar
        title="Add Vehicle"
        right={
          <Link href="/vehicles">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">

        {/* Scan Vehicle panel */}
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setScanOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
          >
            <span>Scan Vehicle Photo</span>
            {scanOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {scanOpen && (
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-muted-foreground">Upload a photo of the vehicle, window sticker, or title to auto-fill fields.</p>
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScan}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={scanning}
                onClick={() => scanInputRef.current?.click()}
              >
                {scanning ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning...</> : 'Upload Photo or Image'}
              </Button>
              {scanMessage && (
                <p className={`text-xs ${scanMessage.type === 'error' ? 'text-destructive' : 'text-green-600'}`}>
                  {scanMessage.text}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Stock # *</Label>
            <Input
              placeholder="Last 6 of VIN"
              value={finalStockNo}
              onChange={(e) => update('stock_no', e.target.value)}
              required
              className="h-12 text-base"
              disabled={!!derivedStockNo}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Year *</Label>
            <Input
              type="number"
              placeholder="2022"
              value={form.year}
              onChange={(e) => update('year', e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Make *</Label>
            <Input
              placeholder="Toyota"
              value={form.make}
              onChange={(e) => update('make', e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Model *</Label>
            <Input
              placeholder="Camry"
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Price</Label>
            <Input
              type="number"
              placeholder="18500"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mileage</Label>
            <Input
              type="number"
              placeholder="42000"
              value={form.mileage}
              onChange={(e) => update('mileage', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Color</Label>
            <Input
              placeholder="Silver"
              value={form.color}
              onChange={(e) => update('color', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => update('status', v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staging">Staging (Recon)</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>VIN</Label>
            {vinDecoding && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Decoding...
              </span>
            )}
            {vinDecoded && !vinDecoding && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle2 className="h-3 w-3" /> Year / make / model filled
              </span>
            )}
          </div>
          <Input
            placeholder="1HGBH41JXMN109186"
            value={form.vin}
            onChange={(e) => {
              update('vin', e.target.value)
              setVinDecoded(false)
            }}
            onBlur={(e) => decodeVin(e.target.value)}
            className="h-12 text-base font-mono"
            maxLength={17}
          />
        </div>

        {form.status === 'staging' && (
          <div className="space-y-3 border rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/10">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Acquisition Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase Price</Label>
                <Input
                  type="number"
                  placeholder="12000"
                  value={form.purchase_price}
                  onChange={(e) => update('purchase_price', e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={form.purchased_at}
                  onChange={(e) => update('purchased_at', e.target.value)}
                  className="h-12 text-base"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Acquisition Source</Label>
              <Select value={form.acquisition_source || '__none__'} onValueChange={(v) => update('acquisition_source', v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unknown</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="private">Private Seller</SelectItem>
                  <SelectItem value="trade_in">Trade-In</SelectItem>
                  <SelectItem value="dealer_trade">Dealer Trade</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Purchased From</Label>
              <Input
                placeholder="Auction, private party, trade-in..."
                value={form.purchased_from}
                onChange={(e) => update('purchased_from', e.target.value)}
                className="h-12 text-base"
              />
            </div>
            {form.acquisition_source === 'auction' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Auction Name</Label>
                  <Input
                    placeholder="OPENLANE, ACV, Manheim..."
                    value={form.auction_name}
                    onChange={(e) => update('auction_name', e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Auction ID / Lot</Label>
                  <Input
                    placeholder="15287526"
                    value={form.auction_lot}
                    onChange={(e) => update('auction_lot', e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Acquisition Notes</Label>
              <Textarea
                placeholder="Title status, condition flags, seller location, transport notes..."
                value={form.acquisition_notes}
                onChange={(e) => update('acquisition_notes', e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            placeholder="Clean title, 1 owner, recent service..."
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base"
          disabled={saving || !finalStockNo || !form.make || !form.model}
        >
          {saving ? 'Saving...' : 'Add Vehicle'}
        </Button>
      </form>
    </div>
  )
}

// ── RE Listing Form ────────────────────────────────────────────────────────────

// Fields that import methods are allowed to prefill (photo_url excluded by design)
const IMPORT_PREFILL_FIELDS = [
  'address_line1', 'city', 'state', 'zip', 'price',
  'bedrooms', 'bathrooms', 'sqft', 'lot_size', 'year_built',
  'property_type', 'hoa_monthly', 'listing_url', 'mls_number', 'notes',
] as const

type ImportPrefillField = typeof IMPORT_PREFILL_FIELDS[number]

function mergeImportFields(
  prev: Record<string, string>,
  imported: Record<string, unknown>
): Record<string, string> {
  const next = { ...prev }
  for (const field of IMPORT_PREFILL_FIELDS) {
    const val = imported[field as ImportPrefillField]
    if (val !== null && val !== undefined && val !== '') {
      next[field] = String(val)
    }
  }
  return next
}

function NewListingForm() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    property_type: '',
    address_line1: '',
    city:          '',
    state:         '',
    zip:           '',
    bedrooms:      '',
    bathrooms:     '',
    sqft:          '',
    price:         '',
    listing_type:  'sale',
    mls_number:    '',
    year_built:    '',
    hoa_monthly:   '',
    notes:         '',
    status:        'available',
    lot_size:      '',
    listing_url:   '',
  })

  // ── Import panel state ─────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false)
  // URL import
  const [urlValue, setUrlValue] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlMessage, setUrlMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  // Text import
  const [pasteText, setPasteText] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textMessage, setTextMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Photo scan
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoMessage, setPhotoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // MLS import
  const [mlsNumber, setMlsNumber] = useState('')
  const [mlsAddress, setMlsAddress] = useState('')
  const [mlsCity, setMlsCity] = useState('')
  const [mlsState, setMlsState] = useState('')
  const [mlsZip, setMlsZip] = useState('')
  const [mlsLoading, setMlsLoading] = useState(false)
  const [mlsMessage, setMlsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Import handlers ────────────────────────────────────────────────────────

  async function handleUrlImport() {
    const trimmed = urlValue.trim()
    if (!trimmed) return

    // Client-side Realtor.com guard — don't call Apify for unsupported source
    try {
      const host = new URL(trimmed).hostname.replace(/^www\./, '')
      if (host === 'realtor.com') {
        setUrlMessage({
          type: 'info',
          text: 'Realtor.com imports are not supported via URL. Use "Paste Listing Text" instead — copy the listing details and paste them there.',
        })
        return
      }
    } catch {
      setUrlMessage({ type: 'error', text: 'Enter a valid URL (starting with https://).' })
      return
    }

    setUrlLoading(true)
    setUrlMessage(null)
    try {
      const res = await fetch('/api/listings/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setUrlMessage({ type: 'error', text: String(data.error ?? 'Import failed. Try again.') })
        return
      }
      setForm(prev => mergeImportFields(prev, data) as typeof form)
      setUrlMessage({ type: 'success', text: 'Listing data imported. Review and edit the fields below before saving.' })
    } catch {
      setUrlMessage({ type: 'error', text: 'Network error — check your connection and try again.' })
    } finally {
      setUrlLoading(false)
    }
  }

  async function handleTextExtract() {
    const trimmed = pasteText.trim()
    if (trimmed.length < 50) {
      setTextMessage({ type: 'error', text: 'Paste at least a sentence or two of listing text.' })
      return
    }
    setTextLoading(true)
    setTextMessage(null)
    try {
      const res = await fetch('/api/listings/import-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setTextMessage({ type: 'error', text: String(data.error ?? 'Extraction failed. Try again.') })
        return
      }
      setForm(prev => mergeImportFields(prev, data) as typeof form)
      setTextMessage({ type: 'success', text: 'Fields extracted from listing text. Review and correct before saving.' })
    } catch {
      setTextMessage({ type: 'error', text: 'Network error — check your connection and try again.' })
    } finally {
      setTextLoading(false)
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setPhotoMessage({ type: 'error', text: 'Select an image file (JPG, PNG, HEIC, etc.).' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoMessage({ type: 'error', text: 'Image must be under 5 MB.' })
      return
    }

    setPhotoLoading(true)
    setPhotoMessage(null)

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/listings/scan-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setPhotoMessage({ type: 'error', text: String(data.error ?? 'Photo scan failed. Try again.') })
        return
      }
      setForm(prev => mergeImportFields(prev, data) as typeof form)
      setPhotoMessage({ type: 'success', text: 'Fields extracted from image. Review and correct before saving.' })
    } catch {
      setPhotoMessage({ type: 'error', text: 'Could not read the image. Try a different file.' })
    } finally {
      setPhotoLoading(false)
      // Reset file input so the same file can be re-selected after an error
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  async function handleMlsImport() {
    const mls = mlsNumber.trim()
    const addr = mlsAddress.trim()
    if (!mls || !addr) {
      setMlsMessage({ type: 'error', text: 'Enter both an MLS number and property address.' })
      return
    }
    setMlsLoading(true)
    setMlsMessage(null)
    try {
      const res = await fetch('/api/listings/import-mls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mls_number: mls,
          address_line1: addr,
          city: mlsCity.trim() || undefined,
          state: mlsState.trim() || undefined,
          zip: mlsZip.trim() || undefined,
        }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setMlsMessage({ type: 'error', text: String(data.error ?? 'MLS lookup failed. Try again.') })
        return
      }
      // MLS import saves immediately — redirect to the new listing detail page
      setMlsMessage({ type: 'success', text: 'Record created — redirecting...' })
      router.push(`/vehicles/${data.id}`)
    } catch {
      setMlsMessage({ type: 'error', text: 'Network error — check your connection and try again.' })
      setMlsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.property_type || !form.address_line1) return
    setSaving(true)

    const mlsNo = form.mls_number.trim()
    const stockNo = mlsNo || `LST-${Date.now().toString().slice(-6)}`

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        stock_no:      stockNo,
        // RE placeholder values: year=0, make='RE', model=address — matches import-mls pattern
        year:          0,
        make:          'RE',
        model:         (form.address_line1 || 'Listing').slice(0, 100),
        price:         form.price ? parseFloat(form.price) : null,
        status:        form.status,
        notes:         form.notes || null,
        property_type: form.property_type || null,
        address_line1: form.address_line1 || null,
        city:          form.city || null,
        state:         form.state || null,
        zip:           form.zip || null,
        bedrooms:      form.bedrooms ? parseInt(form.bedrooms) : null,
        bathrooms:     form.bathrooms ? parseFloat(form.bathrooms) : null,
        sqft:          form.sqft ? parseInt(form.sqft) : null,
        lot_size:      form.lot_size || null,
        listing_type:  form.listing_type || 'sale',
        mls_number:    mlsNo || null,
        year_built:    form.year_built ? parseInt(form.year_built) : null,
        hoa_monthly:   form.hoa_monthly ? parseFloat(form.hoa_monthly) : null,
        listing_url:   form.listing_url || null,
        import_source: 'manual',
      })
      .select('id')
      .single()

    if (data) {
      router.push(`/vehicles/${data.id}`)
    } else {
      setSaving(false)
      console.error(error)
    }
  }

  return (
    <div>
      <TopBar
        title="Add Listing"
        right={
          <Link href="/vehicles">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {/* ── Import Listing panel (RE vertical only) ── */}
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setImportOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-3 bg-muted/50 hover:bg-muted transition-colors text-sm font-semibold"
          >
            <span>Import Listing</span>
            {importOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {importOpen && (
            <div className="divide-y">

              {/* Method 1: URL import */}
              <div className="px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Import from URL (Zillow / Redfin)</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://www.zillow.com/homedetails/..."
                    value={urlValue}
                    onChange={e => setUrlValue(e.target.value)}
                    className="h-10 text-sm flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={urlLoading || !urlValue.trim()}
                    onClick={handleUrlImport}
                    className="shrink-0 h-10"
                  >
                    {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import'}
                  </Button>
                </div>
                {urlLoading && <p className="text-xs text-muted-foreground">Importing listing data...</p>}
                {urlMessage && (
                  <p className={`text-xs ${urlMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : urlMessage.type === 'info' ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}>
                    {urlMessage.text}
                  </p>
                )}
              </div>

              {/* Method 2: Paste Listing Text */}
              <div className="px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paste Listing Text (Realtor.com or any source)</p>
                <Textarea
                  placeholder="Paste listing description text (works with Realtor.com and any MLS source)"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={4}
                  className="resize-none text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={textLoading || pasteText.trim().length < 10}
                  onClick={handleTextExtract}
                  className="h-9"
                >
                  {textLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Extracting...</> : 'Extract Fields'}
                </Button>
                {textLoading && <p className="text-xs text-muted-foreground">Extracting listing info from text...</p>}
                {textMessage && (
                  <p className={`text-xs ${textMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {textMessage.text}
                  </p>
                )}
              </div>

              {/* Method 3: Photo scan */}
              <div className="px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scan Photo / Flyer</p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={photoLoading}
                  onClick={() => photoInputRef.current?.click()}
                  className="h-9"
                >
                  {photoLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Reading image...</> : 'Upload listing photo or flyer'}
                </Button>
                {photoLoading && <p className="text-xs text-muted-foreground">Reading listing info from image...</p>}
                {photoMessage && (
                  <p className={`text-xs ${photoMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {photoMessage.text}
                  </p>
                )}
              </div>

              {/* Method 4: MLS# import (saves immediately) */}
              <div className="px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Import via MLS# (saves immediately)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="MLS Number"
                    value={mlsNumber}
                    onChange={e => setMlsNumber(e.target.value)}
                    className="h-10 text-sm font-mono"
                  />
                  <Input
                    placeholder="123 Main St"
                    value={mlsAddress}
                    onChange={e => setMlsAddress(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="City"
                    value={mlsCity}
                    onChange={e => setMlsCity(e.target.value)}
                    className="h-10 text-sm"
                  />
                  <Input
                    placeholder="State"
                    value={mlsState}
                    onChange={e => setMlsState(e.target.value.toUpperCase())}
                    maxLength={2}
                    className="h-10 text-sm uppercase"
                  />
                  <Input
                    placeholder="Zip"
                    value={mlsZip}
                    onChange={e => setMlsZip(e.target.value)}
                    maxLength={10}
                    className="h-10 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={mlsLoading || !mlsNumber.trim() || !mlsAddress.trim()}
                  onClick={handleMlsImport}
                  className="h-9"
                >
                  {mlsLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating listing...</> : 'Look Up'}
                </Button>
                {mlsMessage && (
                  <p className={`text-xs ${mlsMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {mlsMessage.text}
                  </p>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Property Type *</Label>
            <Select value={form.property_type} onValueChange={(v) => update('property_type', v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_family">Single Family</SelectItem>
                <SelectItem value="condo">Condo</SelectItem>
                <SelectItem value="townhouse">Townhouse</SelectItem>
                <SelectItem value="multi_family">Multi-Family</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Listing Type</Label>
            <Select value={form.listing_type} onValueChange={(v) => update('listing_type', v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">For Sale</SelectItem>
                <SelectItem value="rental">For Rent</SelectItem>
                <SelectItem value="lease">Lease</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Address *</Label>
          <Input
            placeholder="123 Main St"
            value={form.address_line1}
            onChange={(e) => update('address_line1', e.target.value)}
            required
            className="h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-1">
            <Label>City</Label>
            <Input
              placeholder="Austin"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input
              placeholder="TX"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              maxLength={2}
              className="h-12 text-base uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Zip</Label>
            <Input
              placeholder="78701"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
              maxLength={10}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Beds</Label>
            <Input
              type="number"
              placeholder="3"
              value={form.bedrooms}
              onChange={(e) => update('bedrooms', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Baths</Label>
            <Input
              type="number"
              step="0.5"
              placeholder="2"
              value={form.bathrooms}
              onChange={(e) => update('bathrooms', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sq Ft</Label>
            <Input
              type="number"
              placeholder="1800"
              value={form.sqft}
              onChange={(e) => update('sqft', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>List Price</Label>
            <Input
              type="number"
              placeholder="450000"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => update('status', v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sold">Sold / Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>MLS #</Label>
            <Input
              placeholder="1234567"
              value={form.mls_number}
              onChange={(e) => update('mls_number', e.target.value)}
              className="h-12 text-base font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Year Built</Label>
            <Input
              type="number"
              placeholder="1998"
              value={form.year_built}
              onChange={(e) => update('year_built', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>HOA (monthly)</Label>
          <Input
            type="number"
            placeholder="250"
            value={form.hoa_monthly}
            onChange={(e) => update('hoa_monthly', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            placeholder="Property highlights, showing instructions, disclosures..."
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base"
          disabled={saving || !form.property_type || !form.address_line1}
        >
          {saving ? 'Saving...' : 'Add Listing'}
        </Button>
      </form>
    </div>
  )
}

function NewPageInner() {
  const { vertical } = useVertical()
  if (vertical === 'real_estate') {
    return <NewListingForm />
  }
  return <NewVehicleForm />
}

export default function NewVehiclePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>}>
      <NewPageInner />
    </Suspense>
  )
}
