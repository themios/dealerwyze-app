import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'

const EMAIL_TYPE_LABEL: Record<string, string> = {
  welcome:            'Welcome email',
  onboarding_nudge:   'Onboarding nudge',
  dealer_followup_d1: 'Follow-up: Day 1',
  dealer_followup_d3: 'Follow-up: Day 3',
  dealer_followup_d7: 'Follow-up: Day 7',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()

  // Emails sent by the platform to this dealer
  const { data: emails } = await supabase
    .from('platform_email_log')
    .select('id, to_email, subject, email_type, body_text, sent_at')
    .eq('org_id', orgId)
    .order('sent_at', { ascending: false })
    .limit(100)

  // Retention notes logged by platform staff (stored in admin_audit_log)
  const { data: noteRows } = await supabase
    .from('admin_audit_log')
    .select('id, admin_user_id, created_at, details')
    .eq('target_org_id', orgId)
    .eq('action', 'retention_note')
    .order('created_at', { ascending: false })
    .limit(100)

  // Resolve admin display names
  const adminIds = [...new Set((noteRows ?? []).map(r => r.admin_user_id))]
  const nameMap: Record<string, string> = {}
  if (adminIds.length) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', adminIds)
    for (const p of profileRows ?? []) nameMap[p.id] = p.display_name ?? 'Staff'
  }

  type EmailItem = {
    kind: 'email'; id: string; subject: string; body_text: string | null
    email_type: string; type_label: string; to_email: string; ts: string
  }
  type NoteItem = {
    kind: 'note'; id: string; note: string
    contact_method: string | null; admin_name: string; admin_user_id: string; ts: string
  }
  type CommsItem = EmailItem | NoteItem

  const timeline: CommsItem[] = [
    ...(emails ?? []).map(e => ({
      kind:       'email' as const,
      id:         e.id,
      subject:    e.subject,
      body_text:  e.body_text ?? null,
      email_type: e.email_type,
      type_label: EMAIL_TYPE_LABEL[e.email_type] ?? e.email_type,
      to_email:   e.to_email,
      ts:         e.sent_at,
    })),
    ...(noteRows ?? []).map(n => ({
      kind:           'note' as const,
      id:             n.id,
      note:           (n.details as { note?: string })?.note ?? '',
      contact_method: (n.details as { contact_method?: string })?.contact_method ?? null,
      admin_name:     nameMap[n.admin_user_id] ?? 'Staff',
      admin_user_id:  n.admin_user_id,
      ts:             n.created_at,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  return NextResponse.json(timeline)
}
