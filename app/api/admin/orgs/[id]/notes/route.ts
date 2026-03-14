import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/admin/orgs/[id]/notes
 * Returns retention outreach notes for this org (from admin_audit_log where action = 'retention_note').
 *
 * POST /api/admin/orgs/[id]/notes
 * Body: { note: string, contact_method?: string }
 * Logs a retention outreach note to admin_audit_log.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const service = createServiceClient()

  const { data, error } = await service
    .from('admin_audit_log')
    .select('id, admin_user_id, created_at, details, profiles(display_name)')
    .eq('target_org_id', orgId)
    .eq('action', 'retention_note')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })

  const notes = (data ?? []).map(row => {
    const profileData = row.profiles as { display_name?: string } | null
    return {
      id:             row.id,
      admin_name:     profileData?.display_name ?? 'Unknown',
      created_at:     row.created_at,
      note:           (row.details as { note?: string })?.note ?? '',
      contact_method: (row.details as { contact_method?: string })?.contact_method ?? null,
    }
  })

  return NextResponse.json(notes)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const note           = String(body?.note ?? '').trim().slice(0, 2000)
  const contact_method = String(body?.contact_method ?? '').trim().slice(0, 50) || null

  if (!note) {
    return NextResponse.json({ error: 'Note is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify org exists
  const { data: org } = await service
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { error } = await service.from('admin_audit_log').insert({
    admin_user_id:  profile.id,
    target_org_id:  orgId,
    action:         'retention_note',
    details:        { note, contact_method, org_name: org.name },
  })

  if (error) return NextResponse.json({ error: 'Failed to save note' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
