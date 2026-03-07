'use client'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewVehiclePage() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    stock_no: '',
    year: new Date().getFullYear().toString(),
    make: '',
    model: '',
    trim: '',
    color: '',
    mileage: '',
    price: '',
    vin: '',
    status: 'available',
    notes: '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.stock_no || !form.year || !form.make || !form.model) return
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
              placeholder="A1001"
              value={form.stock_no}
              onChange={(e) => update('stock_no', e.target.value)}
              required
              className="h-12 text-base"
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
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>VIN</Label>
          <Input
            placeholder="1HGBH41JXMN109186"
            value={form.vin}
            onChange={(e) => update('vin', e.target.value)}
            className="h-12 text-base font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            placeholder="Clean title, 1 owner, recent service…"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base"
          disabled={saving || !form.stock_no || !form.make || !form.model}
        >
          {saving ? 'Saving…' : 'Add Vehicle'}
        </Button>
      </form>
    </div>
  )
}
