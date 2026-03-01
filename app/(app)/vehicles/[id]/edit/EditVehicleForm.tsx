'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Vehicle } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  vehicle: Vehicle
}

export default function EditVehicleForm({ vehicle }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    stock_no: vehicle.stock_no,
    year: vehicle.year.toString(),
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim || '',
    color: vehicle.color || '',
    mileage: vehicle.mileage?.toString() || '',
    price: vehicle.price?.toString() || '',
    vin: vehicle.vin || '',
    status: vehicle.status,
    notes: vehicle.notes || '',
    listing_url: vehicle.listing_url || '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('vehicles')
      .update({
        stock_no: form.stock_no,
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
        listing_url: form.listing_url || null,
      })
      .eq('id', vehicle.id)

    if (!error) {
      router.push('/vehicles')
    } else {
      console.error(error)
      setSaving(false)
    }
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
          <Label>VIN</Label>
          <Input
            value={form.vin}
            onChange={e => update('vin', e.target.value)}
            className="h-12 text-base font-mono"
          />
        </div>
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
