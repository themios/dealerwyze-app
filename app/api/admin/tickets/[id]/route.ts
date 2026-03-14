import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'
import { requirePlatformSuperAdmin, requirePlatformArea } from '@/lib/auth/platform'
import { sendNotificationEmail } from '@/lib/email/notify'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'tickets')
  if (denied) return denied

  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase.from('support_tickets')
      .select('*, organizations(name)')
      .eq('id', id)
      .single(),
    supabase.from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ticket, messages: messages ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'tickets')
  if (denied) return denied

  const { id } = await params
  const supabase = createServiceClient()
  const body = await req.json() as {
    action: 'update_status' | 'update_priority' | 'reply' | 'internal_note' | 'assign'
    status?: string
    priority?: string
    message?: string
    assigned_to?: string | null
  }

  if (body.action === 'update_status') {
    const update: Record<string, unknown> = { status: body.status }
    if (body.status === 'resolved') update.resolved_at = new Date().toISOString()
    await supabase.from('support_tickets').update(update).eq('id', id)
    await logAdminAction(profile.id, 'ticket_status_update', null, { ticket_id: id, status: body.status })
  }

  else if (body.action === 'update_priority') {
    await supabase.from('support_tickets').update({ priority: body.priority }).eq('id', id)
  }

  else if (body.action === 'reply' || body.action === 'internal_note') {
    if (!body.message?.trim()) return NextResponse.json({ error: 'Message required.' }, { status: 400 })
    await supabase.from('support_ticket_messages').insert({
      ticket_id:   id,
      author_id:   profile.id,
      author_name: profile.display_name,
      body:        body.message.trim(),
      is_internal: body.action === 'internal_note',
    })
    // Move to in_progress when admin replies; stamp first_staff_response_at
    if (body.action === 'reply') {
      const { data: t } = await supabase.from('support_tickets').select('status, first_staff_response_at, subject, created_by, org_id').eq('id', id).single()
      const update: Record<string, unknown> = {}
      if (t?.status === 'open') update.status = 'in_progress'
      if (!t?.first_staff_response_at) update.first_staff_response_at = new Date().toISOString()
      if (Object.keys(update).length > 0) {
        await supabase.from('support_tickets').update(update).eq('id', id)
      }
      // G30: Notify dealer of staff reply (fire-and-forget)
      if (t?.created_by) {
        const { data: authUser } = await supabase.auth.admin.getUserById(t.created_by)
        const dealerEmail = authUser?.user?.email
        if (dealerEmail) {
          void sendNotificationEmail({
            to: dealerEmail,
            subject: `Re: ${t.subject ?? 'Your support ticket'}`,
            html: `<p>Your support ticket has a new reply from the DealerWyze team:</p>
<hr>
<p>${body.message.trim().replace(/\n/g, '<br>')}</p>
<hr>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/support">View your ticket</a></p>
<p style="color:#888;font-size:12px">You are receiving this because you submitted a support ticket at DealerWyze.</p>`,
          })
        }
      }
    }
  }

  else if (body.action === 'assign') {
    // Only super admin can assign tickets
    const denied = await requirePlatformSuperAdmin(profile.id)
    if (denied) return denied
    await supabase.from('support_tickets')
      .update({ assigned_to: body.assigned_to ?? null })
      .eq('id', id)
    await logAdminAction(profile.id, 'ticket_assigned', null, { ticket_id: id, assigned_to: body.assigned_to })
  }

  else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
