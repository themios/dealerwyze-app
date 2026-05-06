import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { createClient } from '@/lib/supabase/server'

function hasStoredPageToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 12
}

export async function GET() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Authenticated RLS on org_social_posting (migration 138) scopes by get_org_id().
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('org_social_posting')
    .select('*')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({
      meta_page_id:                 null,
      instagram_business_account_id: null,
      token_configured:             false,
      facebook_feed:                true,
      instagram_feed:               true,
      facebook_story:               false,
      instagram_story:              false,
      daily_ai_post_enabled:        false,
      daily_ai_timezone:            'America/Los_Angeles',
      last_daily_post_at:           null,
    })
  }

  const token = row.meta_page_access_token as string | null | undefined

  return NextResponse.json({
    meta_page_id:                 row.meta_page_id ?? null,
    instagram_business_account_id: row.instagram_business_account_id ?? null,
    token_configured:             hasStoredPageToken(token),
    facebook_feed:                row.facebook_feed ?? true,
    instagram_feed:               row.instagram_feed ?? true,
    facebook_story:               row.facebook_story ?? false,
    instagram_story:              row.instagram_story ?? false,
    daily_ai_post_enabled:        row.daily_ai_post_enabled ?? false,
    daily_ai_timezone:            row.daily_ai_timezone ?? 'America/Los_Angeles',
    last_daily_post_at:           row.last_daily_post_at ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    meta_page_id?: string | null
    meta_page_access_token?: string | null
    instagram_business_account_id?: string | null
    facebook_feed?: boolean
    instagram_feed?: boolean
    facebook_story?: boolean
    instagram_story?: boolean
    daily_ai_post_enabled?: boolean
    daily_ai_timezone?: string | null
  }

  const supabase = await createClient()

  const payload: Record<string, unknown> = {
    org_id:     profile.org_id,
    updated_at: new Date().toISOString(),
  }

  if (body.meta_page_id !== undefined) {
    const v =
      typeof body.meta_page_id === 'string' ? body.meta_page_id.trim().slice(0, 96) : ''
    payload.meta_page_id = v || null
  }
  if (body.instagram_business_account_id !== undefined) {
    const v =
      typeof body.instagram_business_account_id === 'string'
        ? body.instagram_business_account_id.trim().slice(0, 96)
        : ''
    payload.instagram_business_account_id = v || null
  }
  if (body.facebook_feed !== undefined) payload.facebook_feed = body.facebook_feed
  if (body.instagram_feed !== undefined) payload.instagram_feed = body.instagram_feed
  if (body.facebook_story !== undefined) payload.facebook_story = body.facebook_story
  if (body.instagram_story !== undefined) payload.instagram_story = body.instagram_story
  if (body.daily_ai_post_enabled !== undefined) {
    payload.daily_ai_post_enabled = body.daily_ai_post_enabled
  }
  if (body.daily_ai_timezone !== undefined) {
    payload.daily_ai_timezone =
      (body.daily_ai_timezone?.trim() || 'America/Los_Angeles').slice(0, 64)
  }

  if (body.meta_page_access_token !== undefined) {
    const t = body.meta_page_access_token
    if (t === null || t === '') {
      payload.meta_page_access_token = null
    } else if (typeof t === 'string' && t.trim().length > 0) {
      payload.meta_page_access_token = t.trim().slice(0, 8192)
    }
  }

  const { error } = await supabase.from('org_social_posting').upsert(payload, {
    onConflict: 'org_id',
  })

  if (error) {
    console.error('[settings/social-posting] upsert:', error.message)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }

  await logOrgAudit({
    org_id:     profile.org_id,
    actor_id:   profile.id,
    actor_type: 'user',
    action:     'meta_social_settings_upserted',
    details:    {
      page_id_touched:     body.meta_page_id !== undefined,
      ig_account_touched:  body.instagram_business_account_id !== undefined,
      token_touched:       body.meta_page_access_token !== undefined,
      daily_ai:            body.daily_ai_post_enabled,
    },
    ip:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null,
  })

  const res = await GET()
  return res
}
