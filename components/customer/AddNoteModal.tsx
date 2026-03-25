'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { prefixWithAuthorName } from '@/lib/utils'
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
  const [displayName, setDisplayName] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(d => setDisplayName(d?.display_name ?? null))
        .catch(() => setDisplayName(null))
    }
  }, [open])

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    const bodyWithAuthor = prefixWithAuthorName(displayName, body.trim())
    await supabase.from('activities').insert({
      type: 'note',
      customer_id: customerId,
      vehicle_id: vehicleId ?? null,
      body: bodyWithAuthor,
      completed_at: new Date().toISOString(),
      priority: 'normal',
    })
    await supabase
      .from('activities')
      .update({ addressed_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
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
