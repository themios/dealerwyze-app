import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

type ValidationFailure = {
  error: 'validation_failed'
  field: string
  message: string
}

type EditableNotifications = {
  owner_email: string | null
  telegram_chat_id: string | null
  alert_on_signup: boolean
  alert_on_cancellation: boolean
  alert_on_payment_failure: boolean
  alert_on_connector_failure: boolean
  daily_digest_enabled: boolean
  daily_digest_hour_utc: number
  weekly_briefing_enabled: boolean
  weekly_briefing_day: number
}

function badRequest(field: string, message: string) {
  return NextResponse.json<ValidationFailure>(
    { error: 'validation_failed', field, message },
    { status: 400 }
  )
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validatePayload(payload: unknown): EditableNotifications | ValidationFailure {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'validation_failed', field: 'body', message: 'Invalid payload' }
  }

  const body = payload as Record<string, unknown>

  let owner_email: string | null = null
  if (body.owner_email !== null && body.owner_email !== undefined && body.owner_email !== '') {
    if (typeof body.owner_email !== 'string') {
      return { error: 'validation_failed', field: 'owner_email', message: 'owner_email must be a string or null' }
    }
    const trimmed = body.owner_email.trim()
    if (trimmed.length > 254) {
      return { error: 'validation_failed', field: 'owner_email', message: 'owner_email must be 254 characters or less' }
    }
    if (!isValidEmail(trimmed)) {
      return { error: 'validation_failed', field: 'owner_email', message: 'owner_email format is invalid' }
    }
    owner_email = trimmed
  }

  let telegram_chat_id: string | null = null
  if (body.telegram_chat_id !== null && body.telegram_chat_id !== undefined && body.telegram_chat_id !== '') {
    if (typeof body.telegram_chat_id !== 'string') {
      return {
        error: 'validation_failed',
        field: 'telegram_chat_id',
        message: 'telegram_chat_id must be a string or null',
      }
    }
    const trimmed = body.telegram_chat_id.trim()
    if (trimmed.length > 60) {
      return {
        error: 'validation_failed',
        field: 'telegram_chat_id',
        message: 'telegram_chat_id must be 60 characters or less',
      }
    }
    telegram_chat_id = trimmed
  }

  if (typeof body.alert_on_signup !== 'boolean') {
    return { error: 'validation_failed', field: 'alert_on_signup', message: 'alert_on_signup must be a boolean' }
  }
  const alert_on_signup = body.alert_on_signup

  if (typeof body.alert_on_cancellation !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'alert_on_cancellation',
      message: 'alert_on_cancellation must be a boolean',
    }
  }
  const alert_on_cancellation = body.alert_on_cancellation

  if (typeof body.alert_on_payment_failure !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'alert_on_payment_failure',
      message: 'alert_on_payment_failure must be a boolean',
    }
  }
  const alert_on_payment_failure = body.alert_on_payment_failure

  if (typeof body.alert_on_connector_failure !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'alert_on_connector_failure',
      message: 'alert_on_connector_failure must be a boolean',
    }
  }
  const alert_on_connector_failure = body.alert_on_connector_failure

  if (typeof body.daily_digest_enabled !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'daily_digest_enabled',
      message: 'daily_digest_enabled must be a boolean',
    }
  }
  const daily_digest_enabled = body.daily_digest_enabled

  if (!Number.isInteger(body.daily_digest_hour_utc) || (body.daily_digest_hour_utc as number) < 0 || (body.daily_digest_hour_utc as number) > 23) {
    return {
      error: 'validation_failed',
      field: 'daily_digest_hour_utc',
      message: 'daily_digest_hour_utc must be an integer between 0 and 23',
    }
  }
  const daily_digest_hour_utc = body.daily_digest_hour_utc as number

  if (typeof body.weekly_briefing_enabled !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'weekly_briefing_enabled',
      message: 'weekly_briefing_enabled must be a boolean',
    }
  }
  const weekly_briefing_enabled = body.weekly_briefing_enabled

  if (!Number.isInteger(body.weekly_briefing_day) || (body.weekly_briefing_day as number) < 0 || (body.weekly_briefing_day as number) > 6) {
    return {
      error: 'validation_failed',
      field: 'weekly_briefing_day',
      message: 'weekly_briefing_day must be an integer between 0 and 6',
    }
  }
  const weekly_briefing_day = body.weekly_briefing_day as number

  return {
    owner_email,
    telegram_chat_id,
    alert_on_signup,
    alert_on_cancellation,
    alert_on_payment_failure,
    alert_on_connector_failure,
    daily_digest_enabled,
    daily_digest_hour_utc,
    weekly_briefing_enabled,
    weekly_briefing_day,
  }
}

export async function GET() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_notification_config')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to load notification settings' }, { status: 500 })
  }

  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const json = await req.json().catch(() => null)
  const validated = validatePayload(json)
  if ('error' in validated) {
    return badRequest(validated.field, validated.message)
  }

  const changedKeys = Object.keys(validated)
  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_notification_config')
    .update({
      ...validated,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .not('id', 'is', null)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_notification_config',
    entityId: row.id,
    metadata: { changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
