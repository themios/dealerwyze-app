import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id } = await params
  const supabase = createServiceClient()

  // Verify ticket belongs to org
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ticket.status === 'closed') return NextResponse.json({ error: 'Ticket is closed.' }, { status: 400 })

  const body = await req.json() as { body: string }
  if (!body.body?.trim()) return NextResponse.json({ error: 'Message required.' }, { status: 400 })

  const { data: msg, error } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id:   id,
      author_id:   profile.id,
      author_name: profile.display_name,
      body:        body.body.trim(),
      is_internal: false,
    })
    .select('id, author_name, body, is_internal, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-open ticket if it was resolved
  if (ticket.status === 'resolved') {
    await supabase.from('support_tickets').update({ status: 'open' }).eq('id', id)
  }

  return NextResponse.json(msg, { status: 201 })
}
