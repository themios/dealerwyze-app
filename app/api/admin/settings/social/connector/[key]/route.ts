import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const VALID_KEYS = ['meta', 'tiktok', 'youtube', 'linkedin', 'threads'] as const
const VALID_PLANS = ['free', 'trial', 'growth', 'pro'] as const

type RouteParams = { params: Promise<{ key: string }> }

type PatchBody = {
  app_id?: unknown
  enabled?: unknown
  enabled_for_plans?: unknown
}

type UpdatePayload = {
  app_id?: string | null
  enabled?: boolean
  enabled_for_plans?: string[]
}

function isValidKey(value: string): value is (typeof VALID_KEYS)[number] {
  return (VALID_KEYS as readonly string[]).includes(value)
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

  const resolved = await params
  const key = resolved.key
  if (!isValidKey(key)) {
    return badRequest('Invalid connector key')
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Invalid payload')
  }

  const payload: UpdatePayload = {}

  if (Object.prototype.hasOwnProperty.call(body, 'app_id')) {
    const raw = body.app_id
    if (raw === null || raw === '') {
      payload.app_id = null
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed.length > 200) {
        return badRequest('app_id must be 200 characters or less')
      }
      payload.app_id = trimmed || null
    } else {
      return badRequest('app_id must be a string or null')
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    if (typeof body.enabled !== 'boolean') {
      return badRequest('enabled must be a boolean')
    }
    payload.enabled = body.enabled
  }

  if (Object.prototype.hasOwnProperty.call(body, 'enabled_for_plans')) {
    if (!Array.isArray(body.enabled_for_plans)) {
      return badRequest('enabled_for_plans must be an array')
    }
    const plans = body.enabled_for_plans
    for (const plan of plans) {
      if (typeof plan !== 'string' || !(VALID_PLANS as readonly string[]).includes(plan)) {
        return badRequest('enabled_for_plans contains an invalid plan')
      }
    }
    payload.enabled_for_plans = plans
  }

  const changedKeys = Object.keys(payload)
  if (!changedKeys.length) {
    return badRequest('No valid fields provided for update')
  }

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_connector_config')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('connector_key', key)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to update connector config' }, { status: 500 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_connector_config',
    entityId: row.id,
    metadata: { connector_key: key, changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
