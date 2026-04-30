'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

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

export default function NewVehiclePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>}>
      <NewVehicleForm />
    </Suspense>
  )
}
