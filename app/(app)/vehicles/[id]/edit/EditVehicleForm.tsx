'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Vehicle } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  vehicle: Vehicle
  isRe?: boolean
}

export default function EditVehicleForm({ vehicle, isRe = false }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    // Shared
    stock_no:    vehicle.stock_no ?? '',
    year:        vehicle.year?.toString() ?? '',
    make:        vehicle.make ?? '',
    model:       vehicle.model ?? '',
    trim:        vehicle.trim ?? '',
    color:       vehicle.color ?? '',
    mileage:     vehicle.mileage?.toString() ?? '',
    price:       vehicle.price?.toString() ?? '',
    vin:         vehicle.vin ?? '',
    status:      vehicle.status,
    notes:       vehicle.notes ?? '',
    listing_url: vehicle.listing_url ?? '',
    body_style:  vehicle.body_style ?? '',
    // RE fields
    address_line1:        (vehicle as Vehicle & { address_line1?: string | null }).address_line1 ?? '',
    city:                 (vehicle as Vehicle & { city?: string | null }).city ?? '',
    state:                (vehicle as Vehicle & { state?: string | null }).state ?? '',
    zip:                  (vehicle as Vehicle & { zip?: string | null }).zip ?? '',
    bedrooms:             (vehicle as Vehicle & { bedrooms?: number | null }).bedrooms?.toString() ?? '',
    bathrooms:            (vehicle as Vehicle & { bathrooms?: number | null }).bathrooms?.toString() ?? '',
    sqft:                 (vehicle as Vehicle & { sqft?: number | null }).sqft?.toString() ?? '',
    lot_size:             vehicle.lot_size ?? '',
    year_built:           (vehicle as Vehicle & { year_built?: number | null }).year_built?.toString() ?? '',
    property_type:        (vehicle as Vehicle & { property_type?: string | null }).property_type ?? '',
    listing_type:         (vehicle as Vehicle & { listing_type?: string | null }).listing_type ?? 'sale',
    mls_number:           (vehicle as Vehicle & { mls_number?: string | null }).mls_number ?? '',
    school_district:      (vehicle as Vehicle & { school_district?: string | null }).school_district ?? '',
    subdivision:          (vehicle as Vehicle & { subdivision?: string | null }).subdivision ?? '',
    hoa_monthly:          (vehicle as Vehicle & { hoa_monthly?: number | null }).hoa_monthly?.toString() ?? '',
    showing_instructions: (vehicle as Vehicle & { showing_instructions?: string | null }).showing_instructions ?? '',
    commission_pct:       (vehicle as Vehicle & { commission_pct?: number | null }).commission_pct?.toString() ?? '',
    co_broke_pct:         (vehicle as Vehicle & { co_broke_pct?: number | null }).co_broke_pct?.toString() ?? '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = isRe
      ? {
          address_line1:        form.address_line1 || null,
          city:                 form.city || null,
          state:                form.state || null,
          zip:                  form.zip || null,
          price:                form.price ? parseFloat(form.price) : null,
          status:               form.status,
          notes:                form.notes || null,
          listing_url:          form.listing_url || null,
          property_type:        form.property_type || null,
          listing_type:         form.listing_type || 'sale',
          mls_number:           form.mls_number || null,
          bedrooms:             form.bedrooms ? parseInt(form.bedrooms) : null,
          bathrooms:            form.bathrooms ? parseFloat(form.bathrooms) : null,
          sqft:                 form.sqft ? parseInt(form.sqft) : null,
          lot_size:             form.lot_size || null,
          year_built:           form.year_built ? parseInt(form.year_built) : null,
          school_district:      form.school_district || null,
          subdivision:          form.subdivision || null,
          hoa_monthly:          form.hoa_monthly ? parseFloat(form.hoa_monthly) : null,
          showing_instructions: form.showing_instructions || null,
          commission_pct:       form.commission_pct ? parseFloat(form.commission_pct) : null,
          co_broke_pct:         form.co_broke_pct ? parseFloat(form.co_broke_pct) : null,
          // Keep year/make/model in sync for DB consistency
          year:  form.year_built ? parseInt(form.year_built) : (vehicle.year ?? null),
          make:  form.property_type || (vehicle.make ?? null),
          model: form.address_line1 || (vehicle.model ?? null),
        }
      : {
          stock_no:    form.stock_no,
          year:        parseInt(form.year),
          make:        form.make,
          model:       form.model,
          trim:        form.trim || null,
          color:       form.color || null,
          mileage:     form.mileage ? parseInt(form.mileage) : null,
          price:       form.price ? parseFloat(form.price) : null,
          vin:         form.vin || null,
          status:      form.status,
          notes:       form.notes || null,
          listing_url: form.listing_url || null,
          body_style:  form.body_style || null,
        }

    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      router.push(`/vehicles/${vehicle.id}`)
      router.refresh()
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  if (isRe) {
    return (
      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        <div className="space-y-1.5">
          <Label>Address *</Label>
          <Input
            value={form.address_line1}
            onChange={e => update('address_line1', e.target.value)}
            placeholder="123 Main St"
            required
            className="h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={e => update('city', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input
              value={form.state}
              onChange={e => update('state', e.target.value)}
              placeholder="CA"
              maxLength={2}
              className="h-12 text-base uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>ZIP</Label>
            <Input
              value={form.zip}
              onChange={e => update('zip', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>MLS #</Label>
            <Input
              value={form.mls_number}
              onChange={e => update('mls_number', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Asking Price</Label>
            <Input
              type="number"
              placeholder="450000"
              value={form.price}
              onChange={e => update('price', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => update('status', v)}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sold">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Beds</Label>
            <Input
              type="number"
              value={form.bedrooms}
              onChange={e => update('bedrooms', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Baths</Label>
            <Input
              type="number"
              step="0.5"
              value={form.bathrooms}
              onChange={e => update('bathrooms', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sqft</Label>
            <Input
              type="number"
              value={form.sqft}
              onChange={e => update('sqft', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Property Type</Label>
            <Select value={form.property_type || 'none'} onValueChange={v => update('property_type', v === 'none' ? '' : v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
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
            <Select value={form.listing_type} onValueChange={v => update('listing_type', v)}>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Year Built</Label>
            <Input
              type="number"
              placeholder="1995"
              value={form.year_built}
              onChange={e => update('year_built', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lot Size</Label>
            <Input
              placeholder="0.25 acres"
              value={form.lot_size}
              onChange={e => update('lot_size', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>HOA / mo</Label>
            <Input
              type="number"
              placeholder="250"
              value={form.hoa_monthly}
              onChange={e => update('hoa_monthly', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>School District</Label>
            <Input
              value={form.school_district}
              onChange={e => update('school_district', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Commission %</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="3.0"
              value={form.commission_pct}
              onChange={e => update('commission_pct', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Co-Broke %</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="2.5"
              value={form.co_broke_pct}
              onChange={e => update('co_broke_pct', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Showing Instructions</Label>
          <Textarea
            value={form.showing_instructions}
            onChange={e => update('showing_instructions', e.target.value)}
            placeholder="Lockbox on back door. 1-hour notice required. Contact agent to schedule."
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes (private)</Label>
          <Textarea
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full h-12 text-base"
          disabled={saving || !form.address_line1}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Stock # *</Label>
          <Input
            value={form.stock_no}
            onChange={e => update('stock_no', e.target.value)}
            required
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => update('status', v)}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Year *</Label>
          <Input
            type="number"
            value={form.year}
            onChange={e => update('year', e.target.value)}
            required
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Make *</Label>
          <Input
            value={form.make}
            onChange={e => update('make', e.target.value)}
            required
            className="h-12 text-base"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Model *</Label>
          <Input
            value={form.model}
            onChange={e => update('model', e.target.value)}
            required
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Trim</Label>
          <Input
            value={form.trim}
            onChange={e => update('trim', e.target.value)}
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
            onChange={e => update('price', e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Mileage</Label>
          <Input
            type="number"
            placeholder="42000"
            value={form.mileage}
            onChange={e => update('mileage', e.target.value)}
            className="h-12 text-base"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Color</Label>
          <Input
            value={form.color}
            onChange={e => update('color', e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Body Style</Label>
          <Select value={form.body_style || 'none'} onValueChange={v => update('body_style', v === 'none' ? '' : v)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">--</SelectItem>
              <SelectItem value="sedan">Sedan</SelectItem>
              <SelectItem value="suv">SUV</SelectItem>
              <SelectItem value="truck">Truck</SelectItem>
              <SelectItem value="coupe">Coupe</SelectItem>
              <SelectItem value="hatchback">Hatchback</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="wagon">Wagon</SelectItem>
              <SelectItem value="convertible">Convertible</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>VIN</Label>
        <Input
          value={form.vin}
          onChange={e => update('vin', e.target.value)}
          className="h-12 text-base font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Listing URL</Label>
        <Input
          type="url"
          placeholder="https://www.cargurus.com/Cars/..."
          value={form.listing_url}
          onChange={e => update('listing_url', e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-12 text-base"
        disabled={saving || !form.stock_no || !form.make || !form.model}
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </form>
  )
}
