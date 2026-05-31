/**
 * POST /api/showings/decline
 * Agent declines a showing request.
 * Sends SMS to buyer with optional message.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({
  showing_id: z.string().uuid(),
  message: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  let body: z.infer<typeof Schema>
  try {
    const raw = await req.json()
    const parsed = Schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { showing_id, message } = body

  // Fetch the showing request
  const { data: showing } = await supabase
    .from('showing_requests')
    .select('id, agent_id, buyer_phone, status')
    .eq('id', showing_id)
    .eq('agent_id', profile.id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json(
      { error: 'Showing request not found' },
      { status: 404 }
    )
  }

  // Update status to declined
  const { error: updateError } = await supabase
    .from('showing_requests')
    .update({ status: 'declined' })
    .eq('id', showing_id)

  if (updateError) {
    console.error('Failed to update showing:', updateError)
    return NextResponse.json(
      { error: 'Failed to decline showing' },
      { status: 500 }
    )
  }

  // Send SMS to buyer
  if (showing.buyer_phone) {
    const smsBody = message
      ? `Unfortunately we're not available: ${message}`
      : 'Unfortunately we are not available for those times. Please contact us if you would like to schedule at another time.'

    fetch('/api/twilio/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: showing.buyer_phone,
        body: smsBody,
        org_id: orgId,
      }),
    }).catch((err) => console.error('Failed to send SMS:', err))
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
