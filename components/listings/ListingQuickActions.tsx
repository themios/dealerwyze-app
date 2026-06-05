'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export type ListingInterest = 'high' | 'medium' | 'low' | ''

const INTEREST_OPTIONS: { value: ListingInterest; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'high', label: 'High interest' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

interface Props {
  listingId: string
  initialInterest: ListingInterest
  initialShowingInstructions: string
  initialRealtorNotes: string
}

export default function ListingQuickActions({
  listingId,
  initialInterest,
  initialShowingInstructions,
  initialRealtorNotes,
}: Props) {
  const [interest, setInterest] = useState<ListingInterest>(initialInterest)
  const [showingInstructions, setShowingInstructions] = useState(initialShowingInstructions)
  const [realtorNotes, setRealtorNotes] = useState(initialRealtorNotes)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/vehicles/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_interest: interest || null,
          showing_instructions: showingInstructions.trim() || null,
          overview_enrichment_text: realtorNotes.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Save failed')
        return
      }
      toast.success('Listing notes saved — visible to your whole office')
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Quick actions</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Shared with everyone in your brokerage on this listing — not private to one agent.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`listing-interest-${listingId}`}>Listing interest (team)</Label>
        <select
          id={`listing-interest-${listingId}`}
          value={interest}
          onChange={(e) => setInterest(e.target.value as ListingInterest)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {INTEREST_OPTIONS.map((o) => (
            <option key={o.value || 'none'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`showing-instructions-${listingId}`}>Showing instructions</Label>
        <textarea
          id={`showing-instructions-${listingId}`}
          value={showingInstructions}
          onChange={(e) => setShowingInstructions(e.target.value)}
          rows={2}
          placeholder="Gate code, lockbox, parking, best entrance…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`realtor-notes-${listingId}`}>Realtor showing notes (internal)</Label>
        <textarea
          id={`realtor-notes-${listingId}`}
          value={realtorNotes}
          onChange={(e) => setRealtorNotes(e.target.value)}
          rows={3}
          placeholder="Seller motivation, showing feedback summary, negotiation cues…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <Button type="button" size="sm" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save quick actions'}
      </Button>
    </section>
  )
}
