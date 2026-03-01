import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id } = await params
  const supabase = createServiceClient()

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages } = await supabase
    .from('support_ticket_messages')
    .select('id, author_name, body, is_internal, created_at')
    .eq('ticket_id', id)
    .eq('is_internal', false)   // dealers never see internal notes
    .order('created_at', { ascending: true })

  return NextResponse.json({ ticket, messages: messages ?? [] })
}
