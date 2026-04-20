import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

// GET /api/settings/video — return video settings + quota for current org
export async function GET(_req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('org_video_settings')
    .select('*')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const { data: templates } = await supabase
    .from('video_templates')
    .select('id, name, description, composition_id, aspect_ratio, duration_seconds, thumbnail_url')
    .eq('is_active', true)
    .order('sort_order')

  return NextResponse.json({
    settings: settings ?? null,
    templates: templates ?? [],
  })
}

// PUT /api/settings/video — update video settings
export async function PUT(req: NextRequest) {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: {
    auto_post_on_listing?: boolean
    default_voice?: string
    favorite_template_ids?: string[]
    caption_template?: string | null
    include_price?: boolean
    include_phone?: boolean
    watermark_enabled?: boolean
    auto_post_platforms?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Build update object with only whitelisted fields
  const allowed = [
    'auto_post_on_listing', 'default_voice', 'favorite_template_ids',
    'caption_template', 'include_price', 'include_phone',
    'watermark_enabled', 'auto_post_platforms',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = (body as Record<string, unknown>)[key]
  }

  // Check if row exists
  const { data: existing } = await supabase
    .from('org_video_settings')
    .select('org_id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (existing) {
    await supabase.from('org_video_settings').update(update).eq('org_id', profile.org_id)
  } else {
    // First time — insert
    await supabase.from('org_video_settings').insert({ org_id: profile.org_id, ...update })
  }

  return NextResponse.json({ success: true })
}
