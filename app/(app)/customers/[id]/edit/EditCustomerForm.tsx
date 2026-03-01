'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  customer: Customer
}

export default function EditCustomerForm({ customer }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: customer.name,
    primary_phone: customer.primary_phone,
    secondary_phone: customer.secondary_phone || '',
    email: customer.email || '',
    notes: customer.notes || '',
    lead_source: customer.lead_source || '',
    zip_code: customer.zip_code || '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.primary_phone) return
    setSaving(true)

    const { error } = await supabase
      .from('customers')
      .update({
        name: form.name,
        primary_phone: form.primary_phone,
        secondary_phone: form.secondary_phone || null,
        email: form.email || null,
        notes: form.notes || null,
        lead_source: form.lead_source || null,
        zip_code: form.zip_code || null,
      })
      .eq('id', customer.id)

    if (!error) {
      router.push(`/customers/${customer.id}`)
    } else {
      console.error(error)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={e => update('name', e.target.value)}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Phone *</Label>
        <Input
          type="tel"
          value={form.primary_phone}
          onChange={e => update('primary_phone', e.target.value)}
          required
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Secondary Phone</Label>
        <Input
          type="tel"
          value={form.secondary_phone}
          onChange={e => update('secondary_phone', e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={e => update('email', e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Lead Source</Label>
          <Select value={form.lead_source || 'direct'} onValueChange={v => update('lead_source', v === 'direct' ? '' : v)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="cargurus">CarGurus</SelectItem>
              <SelectItem value="autotrader">AutoTrader</SelectItem>
              <SelectItem value="offerup">OfferUp</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="craigslist">Craigslist</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="walkin">Walk-in</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>ZIP Code</Label>
          <Input
            value={form.zip_code}
            onChange={e => update('zip_code', e.target.value)}
            className="h-12 text-base"
            maxLength={10}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={3}
          className="resize-none"
          placeholder="Buyer profile, financing needs, trade-in info…"
        />
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-base"
        disabled={saving || !form.name || !form.primary_phone}
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </form>
  )
}
