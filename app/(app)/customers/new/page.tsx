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
import { useVertical } from '@/hooks/useVertical'

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createClient()
  const { vertical } = useVertical()
  const isRe = vertical === 'real_estate'
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    interested_in: '',
    lead_source: '',
    primary_phone: '',
    secondary_phone: '',
    email: '',
    notes: '',
    zip_code: '',
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    setSaving(true)

    // Free tier cap: 200 contacts
    const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true })
    if ((count ?? 0) >= 200) {
      setSaving(false)
      alert('You\'ve reached the 200-contact limit for the free beta tier. Contact support@dealerwyze.com if you need more.')
      return
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: form.name,
        interested_in: form.interested_in || null,
        lead_source: form.lead_source || null,
        primary_phone: form.primary_phone || '',
        secondary_phone: form.secondary_phone || null,
        email: form.email || null,
        notes: form.notes || null,
        zip_code: form.zip_code || null,
      })
      .select('id')
      .single()

    if (data) {
      router.push(`/customers/${data.id}`)
    } else {
      setSaving(false)
      console.error(error)
    }
  }

  return (
    <div>
      <TopBar
        title="New Customer"
        right={
          <Link href="/customers">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {/* Required */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="John Smith"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            required
            autoFocus
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="interested_in">{isRe ? 'Looking For' : 'Interested In'}</Label>
          <Input
            id="interested_in"
            placeholder={isRe ? 'Property type, neighborhood, budget…' : '2020 Honda CR-V, silver SUV under $20k…'}
            value={form.interested_in}
            onChange={e => update('interested_in', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={form.lead_source || '_none'} onValueChange={v => update('lead_source', v === '_none' ? '' : v)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Where did they come from?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Unknown</SelectItem>
              {isRe ? (
                <>
                  <SelectItem value="zillow">Zillow</SelectItem>
                  <SelectItem value="realtor">Realtor.com</SelectItem>
                  <SelectItem value="redfin">Redfin</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="open_house">Open House</SelectItem>
                  <SelectItem value="sign_call">Sign Call</SelectItem>
                  <SelectItem value="website">Agency Website</SelectItem>
                  <SelectItem value="direct">Direct / Other</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="offerup">OfferUp</SelectItem>
                  <SelectItem value="craigslist">Craigslist</SelectItem>
                  <SelectItem value="cargurus">CarGurus</SelectItem>
                  <SelectItem value="autotrader">AutoTrader</SelectItem>
                  <SelectItem value="kbb">KBB</SelectItem>
                  <SelectItem value="autolist">Autolist</SelectItem>
                  <SelectItem value="carsforsale">Carsforsale.com</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="walkin">Walk-in</SelectItem>
                  <SelectItem value="direct">Direct / Other</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Optional contact info */}
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold pt-1">Contact Info (optional)</p>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="(805) 555-0100"
            value={form.primary_phone}
            onChange={e => update('primary_phone', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone2">Secondary Phone</Label>
            <Input
              id="phone2"
              type="tel"
              placeholder="(805) 555-0200"
              value={form.secondary_phone}
              onChange={e => update('secondary_phone', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zip">ZIP Code</Label>
            <Input
              id="zip"
              placeholder="93101"
              value={form.zip_code}
              onChange={e => update('zip_code', e.target.value)}
              className="h-12 text-base"
              maxLength={10}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="First time buyer, needs financing…"
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button type="submit" className="w-full h-12 text-base" disabled={saving || !form.name}>
          {saving ? 'Saving…' : 'Add Customer'}
        </Button>
      </form>
    </div>
  )
}
