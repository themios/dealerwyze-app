'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ShoppingCart, Pencil } from 'lucide-react'

interface BuySheetData {
  purchase_price:    number | null
  purchased_at:      string | null
  purchased_from:    string | null
  acquisition_source: string | null
  auction_name:      string | null
  auction_lot:       string | null
  floor_plan_amount: number | null
  acquisition_notes: string | null
}

interface Props {
  vehicleId: string
  initial: BuySheetData
}

const NONE = '__none__'

export default function BuySheetCard({ vehicleId, initial }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({
    purchase_price:    initial.purchase_price    != null ? String(initial.purchase_price) : '',
    purchased_at:      initial.purchased_at      ?? '',
    purchased_from:    initial.purchased_from    ?? '',
    acquisition_source: initial.acquisition_source ?? NONE,
    auction_name:      initial.auction_name      ?? '',
    auction_lot:       initial.auction_lot       ?? '',
    floor_plan_amount: initial.floor_plan_amount != null ? String(initial.floor_plan_amount) : '',
    acquisition_notes: initial.acquisition_notes ?? '',
  })
  const [saved, setSaved] = useState(initial)

  function upd(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    try {
      const payload = {
        purchase_price:    form.purchase_price    ? parseFloat(form.purchase_price)    : null,
        purchased_at:      form.purchased_at      || null,
        purchased_from:    form.purchased_from    || null,
        acquisition_source: form.acquisition_source === NONE ? null : form.acquisition_source,
        auction_name:      form.auction_name      || null,
        auction_lot:       form.auction_lot       || null,
        floor_plan_amount: form.floor_plan_amount ? parseFloat(form.floor_plan_amount) : null,
        acquisition_notes: form.acquisition_notes || null,
      }
      const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId)
      if (error) { alert('Save failed'); return }
      setSaved(payload)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const isAuction = (editing ? form.acquisition_source : saved.acquisition_source) === 'auction'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Buy Sheet
          </CardTitle>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Purchase Price</Label>
                <Input value={form.purchase_price} onChange={e => upd('purchase_price', e.target.value)} type="number" min={0} placeholder="0" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Date Purchased</Label>
                <Input value={form.purchased_at} onChange={e => upd('purchased_at', e.target.value)} type="date" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Source</Label>
              <Select value={form.acquisition_source} onValueChange={v => upd('acquisition_source', v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unknown</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="private">Private Seller</SelectItem>
                  <SelectItem value="trade_in">Trade-In</SelectItem>
                  <SelectItem value="dealer_trade">Dealer Trade</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Purchased From</Label>
              <Input value={form.purchased_from} onChange={e => upd('purchased_from', e.target.value)} placeholder="Seller name / auction house" className="h-10" />
            </div>
            {isAuction && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Auction Name</Label>
                  <Input value={form.auction_name} onChange={e => upd('auction_name', e.target.value)} placeholder="Manheim, ADESA..." className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Lot #</Label>
                  <Input value={form.auction_lot} onChange={e => upd('auction_lot', e.target.value)} placeholder="12345" className="h-10" />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Floor Plan Amount</Label>
              <Input value={form.floor_plan_amount} onChange={e => upd('floor_plan_amount', e.target.value)} type="number" min={0} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Textarea value={form.acquisition_notes} onChange={e => upd('acquisition_notes', e.target.value)} placeholder="Condition notes, seller details, etc." className="h-20 resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={save} disabled={saving} className="flex-1 h-10">
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="h-10 px-4">
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            {!saved.purchase_price && !saved.purchased_from && !saved.purchased_at ? (
              <p className="text-muted-foreground text-xs">No acquisition info recorded. Tap Edit to add.</p>
            ) : (
              <>
                {saved.purchase_price != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purchase Price</span>
                    <span className="font-medium">${saved.purchase_price.toLocaleString()}</span>
                  </div>
                )}
                {saved.purchased_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span>{new Date(saved.purchased_at + 'T12:00:00').toLocaleDateString()}</span>
                  </div>
                )}
                {saved.acquisition_source && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source</span>
                    <span className="capitalize">{saved.acquisition_source.replace('_', ' ')}</span>
                  </div>
                )}
                {saved.purchased_from && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span>{saved.purchased_from}</span>
                  </div>
                )}
                {saved.auction_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Auction</span>
                    <span>{saved.auction_name}{saved.auction_lot ? ` #${saved.auction_lot}` : ''}</span>
                  </div>
                )}
                {saved.floor_plan_amount != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Floor Plan</span>
                    <span>${saved.floor_plan_amount.toLocaleString()}</span>
                  </div>
                )}
                {saved.acquisition_notes && (
                  <p className="text-muted-foreground text-xs pt-1 border-t">{saved.acquisition_notes}</p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
