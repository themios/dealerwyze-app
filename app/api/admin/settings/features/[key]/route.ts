import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ key: string }>
}

const ALLOWED_PLANS = ['free', 'trial', 'starter', 'growth', 'pro'] as const

type PatchBody = {
  enabled_globally?: unknown
  kill_switch?: unknown
  enabled_for_plans?: unknown
}

type PatchPayload = {
  enabled_globally?: boolean
  kill_switch?: boolean
  enabled_for_plans?: string[]
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key } = await params
  if (!key || typeof key !== 'string' || key.trim().length === 0 || key.length > 60) {
    return badRequest('Invalid flag key')
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Invalid payload')
  }

  const payload: PatchPayload = {}

  if (Object.prototype.hasOwnProperty.call(body, 'enabled_globally')) {
    if (typeof body.enabled_globally !== 'boolean') {
      return badRequest('enabled_globally must be a boolean')
    }
    payload.enabled_globally = body.enabled_globally
  }

  if (Object.prototype.hasOwnProperty.call(body, 'kill_switch')) {
    if (typeof body.kill_switch !== 'boolean') {
      return badRequest('kill_switch must be a boolean')
    }
    payload.kill_switch = body.kill_switch
  }

  if (Object.prototype.hasOwnProperty.call(body, 'enabled_for_plans')) {
    if (!Array.isArray(body.enabled_for_plans)) {
      return badRequest('enabled_for_plans must be an array')
    }
    for (const plan of body.enabled_for_plans) {
      if (typeof plan !== 'string' || !(ALLOWED_PLANS as readonly string[]).includes(plan)) {
        return badRequest('enabled_for_plans contains an invalid plan')
      }
    }
    payload.enabled_for_plans = body.enabled_for_plans
  }

  const changedKeys = Object.keys(payload)
  if (!changedKeys.length) {
    return badRequest('No valid fields provided')
  }

  const supabase = createServiceClient()

  // Scope the update to the correct vertical so a flag_key shared across verticals
  // only updates the row belonging to the current admin's vertical.
  const host = req.headers.get('host') ?? ''
  const vertical = ['realtywyze.us', 'realtywyze.localhost'].some(h => host.includes(h))
    ? 'real_estate'
    : 'dealer'

  const { data: row, error } = await supabase
    .from('platform_feature_flags')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('flag_key', key)
    .eq('vertical', vertical)
    .select('id, flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, updated_at')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_feature_flags',
    entityId: row.id,
    metadata: { flag_key: key, changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
