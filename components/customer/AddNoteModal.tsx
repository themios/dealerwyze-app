'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface AddNoteModalProps {
  open: boolean
  onClose: () => void
  customerId: string
  vehicleId?: string
  onSaved: () => void
}

export default function AddNoteModal({ open, onClose, customerId, vehicleId, onSaved }: AddNoteModalProps) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    await supabase.from('activities').insert({
      type: 'note',
      customer_id: customerId,
      vehicle_id: vehicleId ?? null,
      body,
      completed_at: new Date().toISOString(),
      priority: 'normal',
    })
    setSaving(false)
    setBody('')
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl h-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Add Note</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <Textarea
            placeholder="What happened or what to remember…"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            className="resize-none"
            autoFocus
          />
          <Button className="w-full h-11" onClick={handleSave} disabled={saving || !body.trim()}>
            {saving ? 'Saving…' : 'Save Note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
