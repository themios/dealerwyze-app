import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

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

  const priority = body.priority ?? 'normal'
  const SLA_HOURS: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 }
  const slaHours = SLA_HOURS[priority] ?? 24
  const sla_breach_at = new Date(Date.now() + slaHours * 3600000).toISOString()

  const { data: ticket, error: tErr } = await supabase
    .from('support_tickets')
    .insert({
      org_id:       profile.org_id,
      subject:      body.subject.trim(),
      priority,
      created_by:   profile.id,
      sla_breach_at,
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

  // G29: Notify DealerWyze support of new ticket (fire-and-forget)
  const { data: org } = await supabase.from('organizations').select('name').eq('id', profile.org_id).maybeSingle()
  const supportEmail = process.env.SUPPORT_EMAIL ?? 'support@dealerwyze.com'
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1)
  void sendNotificationEmail({
    to: supportEmail,
    from: `DealerWyze Tickets <tickets@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`,
    subject: `[New Ticket] ${org?.name ?? 'Unknown Org'} — ${body.subject.trim()}`,
    html: `<p><strong>Org:</strong> ${org?.name ?? profile.org_id}<br>
<strong>Priority:</strong> ${priorityLabel}<br>
<strong>Subject:</strong> ${body.subject.trim()}</p>
<hr>
<p>${body.message.trim().replace(/\n/g, '<br>')}</p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/tickets/${ticket.id}">View ticket in admin</a></p>`,
  })

  return NextResponse.json({ id: ticket.id }, { status: 201 })
}
