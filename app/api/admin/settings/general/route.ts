import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

type EditableGeneralSettings = {
  platform_name: string
  support_email: string
  support_phone: string | null
  help_url: string | null
  terms_url: string | null
  privacy_url: string | null
  default_trial_days: number
  default_timezone: string
}

type ValidationFailure = {
  error: 'validation_failed'
  field: string
  message: string
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

function parseOptionalHttpsUrl(value: unknown, field: string): string | null | ValidationFailure {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    return { error: 'validation_failed', field, message: 'Must be a string' }
  }
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('https://')) {
    return { error: 'validation_failed', field, message: 'URL must start with https://' }
  }
  return trimmed
}

function isValidationFailure(value: unknown): value is ValidationFailure {
  return typeof value === 'object' && value !== null && 'error' in value
}

function validateEditableFields(payload: unknown): EditableGeneralSettings | ValidationFailure {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'validation_failed', field: 'body', message: 'Invalid payload' }
  }

  const body = payload as Record<string, unknown>

  const platformNameRaw = body.platform_name
  if (typeof platformNameRaw !== 'string' || !platformNameRaw.trim()) {
    return { error: 'validation_failed', field: 'platform_name', message: 'Platform name is required' }
  }
  const platform_name = platformNameRaw.trim()
  if (platform_name.length > 100) {
    return { error: 'validation_failed', field: 'platform_name', message: 'Platform name must be 100 characters or less' }
  }

  const supportEmailRaw = body.support_email
  if (typeof supportEmailRaw !== 'string' || !supportEmailRaw.trim()) {
    return { error: 'validation_failed', field: 'support_email', message: 'Support email is required' }
  }
  const support_email = supportEmailRaw.trim()
  if (support_email.length > 254) {
    return { error: 'validation_failed', field: 'support_email', message: 'Support email must be 254 characters or less' }
  }
  if (!isValidEmail(support_email)) {
    return { error: 'validation_failed', field: 'support_email', message: 'Support email format is invalid' }
  }

  const supportPhoneRaw = body.support_phone
  let support_phone: string | null = null
  if (supportPhoneRaw !== null && supportPhoneRaw !== undefined) {
    if (typeof supportPhoneRaw !== 'string') {
      return { error: 'validation_failed', field: 'support_phone', message: 'Support phone must be a string' }
    }
    const trimmed = supportPhoneRaw.trim()
    if (trimmed.length > 30) {
      return { error: 'validation_failed', field: 'support_phone', message: 'Support phone must be 30 characters or less' }
    }
    support_phone = trimmed || null
  }

  const helpUrlParsed = parseOptionalHttpsUrl(body.help_url, 'help_url')
  if (isValidationFailure(helpUrlParsed)) {
    return helpUrlParsed
  }
  const termsUrlParsed = parseOptionalHttpsUrl(body.terms_url, 'terms_url')
  if (isValidationFailure(termsUrlParsed)) {
    return termsUrlParsed
  }
  const privacyUrlParsed = parseOptionalHttpsUrl(body.privacy_url, 'privacy_url')
  if (isValidationFailure(privacyUrlParsed)) {
    return privacyUrlParsed
  }

  const trialDaysRaw = body.default_trial_days
  const trialDaysNumber =
    typeof trialDaysRaw === 'number'
      ? trialDaysRaw
      : typeof trialDaysRaw === 'string'
        ? Number(trialDaysRaw)
        : NaN
  if (!Number.isInteger(trialDaysNumber) || trialDaysNumber < 1 || trialDaysNumber > 365) {
    return {
      error: 'validation_failed',
      field: 'default_trial_days',
      message: 'Default trial days must be an integer between 1 and 365',
    }
  }

  const timezoneRaw = body.default_timezone
  if (typeof timezoneRaw !== 'string' || !timezoneRaw.trim()) {
    return { error: 'validation_failed', field: 'default_timezone', message: 'Default timezone is required' }
  }
  const default_timezone = timezoneRaw.trim()
  if (default_timezone.length > 60) {
    return { error: 'validation_failed', field: 'default_timezone', message: 'Default timezone must be 60 characters or less' }
  }

  return {
    platform_name,
    support_email,
    support_phone,
    help_url: helpUrlParsed,
    terms_url: termsUrlParsed,
    privacy_url: privacyUrlParsed,
    default_trial_days: trialDaysNumber,
    default_timezone,
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
    .from('platform_settings')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to load platform settings' }, { status: 500 })
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
  const validated = validateEditableFields(json)
  if ('error' in validated) {
    return badRequest(validated.field, validated.message)
  }

  const changedKeys = Object.keys(validated)
  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_settings')
    .update({
      ...validated,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .not('id', 'is', null)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to update platform settings' }, { status: 500 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_settings',
    entityId: row.id,
    metadata: { changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
