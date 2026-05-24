import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'threads'] as const
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ValidationFailure = {
  error: 'validation_failed'
  field: string
  message: string
}

type EditableContentConfig = {
  marketing_org_id: string | null
  default_platforms: string[]
  weekly_generator_enabled: boolean
  weekly_generator_day: number
  weekly_generator_hour_utc: number
  default_content_themes: string[]
  ai_brand_voice_prompt: string | null
  tavily_categories: string[]
  posts_per_week: number
}

function badRequest(field: string, message: string) {
  return NextResponse.json<ValidationFailure>(
    { error: 'validation_failed', field, message },
    { status: 400 }
  )
}

function validateStringArray(
  value: unknown,
  field: string,
  maxItems: number
): string[] | ValidationFailure {
  if (!Array.isArray(value)) {
    return { error: 'validation_failed', field, message: `${field} must be an array` }
  }
  if (value.length > maxItems) {
    return { error: 'validation_failed', field, message: `${field} cannot exceed ${maxItems} items` }
  }

  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return { error: 'validation_failed', field, message: `${field} items must be strings` }
    }
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > 60) {
      return { error: 'validation_failed', field, message: `${field} items must be 60 characters or less` }
    }
    out.push(trimmed)
  }
  return out
}

function isValidationFailure(value: unknown): value is ValidationFailure {
  return typeof value === 'object' && value !== null && 'error' in value
}

function validatePayload(payload: unknown): EditableContentConfig | ValidationFailure {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'validation_failed', field: 'body', message: 'Invalid payload' }
  }

  const body = payload as Record<string, unknown>

  let marketing_org_id: string | null = null
  if (body.marketing_org_id !== undefined && body.marketing_org_id !== null && body.marketing_org_id !== '') {
    if (typeof body.marketing_org_id !== 'string') {
      return { error: 'validation_failed', field: 'marketing_org_id', message: 'marketing_org_id must be a UUID or null' }
    }
    const trimmed = body.marketing_org_id.trim()
    if (!UUID_REGEX.test(trimmed)) {
      return { error: 'validation_failed', field: 'marketing_org_id', message: 'marketing_org_id must be a valid UUID' }
    }
    marketing_org_id = trimmed
  }

  if (!Array.isArray(body.default_platforms)) {
    return { error: 'validation_failed', field: 'default_platforms', message: 'default_platforms must be an array' }
  }
  const default_platforms: string[] = []
  for (const item of body.default_platforms) {
    if (typeof item !== 'string' || !(VALID_PLATFORMS as readonly string[]).includes(item)) {
      return {
        error: 'validation_failed',
        field: 'default_platforms',
        message: 'default_platforms contains an invalid platform',
      }
    }
    if (!default_platforms.includes(item)) {
      default_platforms.push(item)
    }
  }

  if (typeof body.weekly_generator_enabled !== 'boolean') {
    return {
      error: 'validation_failed',
      field: 'weekly_generator_enabled',
      message: 'weekly_generator_enabled must be a boolean',
    }
  }
  const weekly_generator_enabled = body.weekly_generator_enabled

  if (!Number.isInteger(body.weekly_generator_day) || (body.weekly_generator_day as number) < 0 || (body.weekly_generator_day as number) > 6) {
    return {
      error: 'validation_failed',
      field: 'weekly_generator_day',
      message: 'weekly_generator_day must be an integer between 0 and 6',
    }
  }
  const weekly_generator_day = body.weekly_generator_day as number

  if (
    !Number.isInteger(body.weekly_generator_hour_utc) ||
    (body.weekly_generator_hour_utc as number) < 0 ||
    (body.weekly_generator_hour_utc as number) > 23
  ) {
    return {
      error: 'validation_failed',
      field: 'weekly_generator_hour_utc',
      message: 'weekly_generator_hour_utc must be an integer between 0 and 23',
    }
  }
  const weekly_generator_hour_utc = body.weekly_generator_hour_utc as number

  const themes = validateStringArray(body.default_content_themes, 'default_content_themes', 12)
  if (isValidationFailure(themes)) return themes

  let ai_brand_voice_prompt: string | null = null
  if (body.ai_brand_voice_prompt !== undefined && body.ai_brand_voice_prompt !== null && body.ai_brand_voice_prompt !== '') {
    if (typeof body.ai_brand_voice_prompt !== 'string') {
      return { error: 'validation_failed', field: 'ai_brand_voice_prompt', message: 'ai_brand_voice_prompt must be a string or null' }
    }
    const trimmed = body.ai_brand_voice_prompt.trim()
    if (trimmed.length > 2000) {
      return { error: 'validation_failed', field: 'ai_brand_voice_prompt', message: 'ai_brand_voice_prompt must be 2000 characters or less' }
    }
    ai_brand_voice_prompt = trimmed || null
  }

  const categories = validateStringArray(body.tavily_categories, 'tavily_categories', 20)
  if (isValidationFailure(categories)) return categories

  if (!Number.isInteger(body.posts_per_week) || (body.posts_per_week as number) < 1 || (body.posts_per_week as number) > 28) {
    return {
      error: 'validation_failed',
      field: 'posts_per_week',
      message: 'posts_per_week must be an integer between 1 and 28',
    }
  }
  const posts_per_week = body.posts_per_week as number

  return {
    marketing_org_id,
    default_platforms,
    weekly_generator_enabled,
    weekly_generator_day,
    weekly_generator_hour_utc,
    default_content_themes: themes,
    ai_brand_voice_prompt,
    tavily_categories: categories,
    posts_per_week,
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
    .from('platform_content_config')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to load content settings' }, { status: 500 })
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
    .from('platform_content_config')
    .update({
      ...validated,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .not('id', 'is', null)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to update content settings' }, { status: 500 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_content_config',
    entityId: row.id,
    metadata: { changed_keys: changedKeys },
  })

  return NextResponse.json({ data: row })
}
