import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'
import { logOrgAudit } from '@/lib/audit/orgAudit'

const ALLOWED_EVENTS = ['new_lead', 'stage_change', 'appointment_created', 'bhph_payment_received']

export async function GET() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: hooks, error } = await supabase
    .from('org_webhooks')
    .select('id, url, events, active, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load webhooks' }, { status: 500 })

  return NextResponse.json({ webhooks: hooks ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { url?: unknown; events?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url || url.length > 500 || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid URL (http or https) is required' }, { status: 400 })
  }

  const rawEvents = Array.isArray(body.events) ? body.events : []
  const events = rawEvents.filter(
    (e): e is string => typeof e === 'string' && (e === '*' || ALLOWED_EVENTS.includes(e)),
  )
  if (events.length === 0) {
    return NextResponse.json({ error: 'At least one valid event is required' }, { status: 400 })
  }

  const secret = crypto.randomBytes(32).toString('hex')
  const supabase = await createClient()

  const { data: hook, error } = await supabase
    .from('org_webhooks')
    .insert({
      org_id: profile.org_id,
      url,
      events,
      secret,
      active: true,
    })
    .select('id, url, events, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })

  void logOrgAudit({ org_id: profile.org_id, actor_id: profile.id, actor_type: 'user',
    action: 'webhook_created', details: { url, events } })

  // Return secret ONCE — it will not be returned on future GETs
  return NextResponse.json({ webhook: { ...hook, secret } }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = await createClient()

  // Verify org ownership before deleting
  const { data: existing } = await supabase
    .from('org_webhooks')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('org_webhooks')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })

  void logOrgAudit({ org_id: profile.org_id, actor_id: profile.id, actor_type: 'user',
    action: 'webhook_deleted', details: { webhook_id: id } })

  return NextResponse.json({ ok: true })
}
