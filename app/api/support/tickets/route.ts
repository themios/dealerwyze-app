import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, status, priority, created_at, resolved_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const body = await req.json() as { subject: string; message: string; priority?: string }

  if (!body.subject?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: 'Subject and message are required.' }, { status: 400 })
  }

  const { data: ticket, error: tErr } = await supabase
    .from('support_tickets')
    .insert({
      org_id:     profile.org_id,
      subject:    body.subject.trim(),
      priority:   body.priority ?? 'normal',
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (tErr || !ticket) return NextResponse.json({ error: tErr?.message ?? 'Failed' }, { status: 500 })

  await supabase.from('support_ticket_messages').insert({
    ticket_id:   ticket.id,
    author_id:   profile.id,
    author_name: profile.display_name,
    body:        body.message.trim(),
    is_internal: false,
  })

  return NextResponse.json({ id: ticket.id }, { status: 201 })
}
