// app/api/settings/pulse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('org_settings')
    .select('pulse_enabled, pulse_auto_send_on_sold, pulse_send_day30, pulse_send_day180')
    .eq('org_id', profile.org_id)
    .maybeSingle()
  return NextResponse.json(data ?? {
    pulse_enabled: false, pulse_auto_send_on_sold: true,
    pulse_send_day30: true, pulse_send_day180: false,
  })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.pulse_enabled           === 'boolean') update.pulse_enabled           = body.pulse_enabled
  if (typeof body.pulse_auto_send_on_sold === 'boolean') update.pulse_auto_send_on_sold = body.pulse_auto_send_on_sold
  if (typeof body.pulse_send_day30        === 'boolean') update.pulse_send_day30        = body.pulse_send_day30
  if (typeof body.pulse_send_day180       === 'boolean') update.pulse_send_day180       = body.pulse_send_day180

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('org_settings')
    .update(update)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
