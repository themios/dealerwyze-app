import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ plan: string }>
}

const VALID_PLANS = ['free', 'trial', 'starter', 'growth', 'pro'] as const
const QUOTA_FIELDS = [
  'max_leads',
  'max_staff_users',
  'max_locations',
  'monthly_sms_limit',
  'monthly_ai_asks',
  'video_renders_per_month',
] as const

type QuotaField = (typeof QUOTA_FIELDS)[number]
type PatchBody = Partial<Record<QuotaField, unknown>>
type PatchPayload = Partial<Record<QuotaField, number | null>>

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { plan } = await params
  if (!(VALID_PLANS as readonly string[]).includes(plan)) {
    return badRequest('Invalid plan')
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Invalid payload')
  }

  const payload: PatchPayload = {}
  for (const field of QUOTA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue
    const value = body[field]

    if (value === null) {
      payload[field] = null
      continue
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return badRequest(`${field} must be an integer >= 0 or null`)
    }
    payload[field] = value
  }

  const changedKeys = Object.keys(payload)
  if (!changedKeys.length) {
    return badRequest('No valid fields provided')
  }

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_plan_quotas')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('plan', plan)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Plan quota row not found' }, { status: 404 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_plan_quotas',
    entityId: row.id,
    metadata: { plan, changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
