/**
 * GET  /api/settings/social-defaults — return the org's social post defaults.
 * PATCH /api/settings/social-defaults — update hashtags, tagline, and/or footer.
 *
 * These values are appended to every manually-composed social post caption
 * (Facebook photo/reel and Instagram carousel).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'

const PatchSchema = z.object({
  social_hashtags: z.string().max(500).optional(),
  social_tagline:  z.string().max(200).optional(),
  social_footer:   z.string().max(500).optional(),
})

export async function GET() {
  const profile  = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('org_settings')
    .select('social_hashtags, social_tagline, social_footer')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    social_hashtags: data?.social_hashtags ?? '',
    social_tagline:  data?.social_tagline  ?? '',
    social_footer:   data?.social_footer   ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 422 })
  }

  const updates: Record<string, string> = {}
  if (parsed.data.social_hashtags !== undefined) updates.social_hashtags = parsed.data.social_hashtags
  if (parsed.data.social_tagline  !== undefined) updates.social_tagline  = parsed.data.social_tagline
  if (parsed.data.social_footer   !== undefined) updates.social_footer   = parsed.data.social_footer

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 422 })
  }

  const supabase = await createClient()

  // Upsert so the row is created even if org_settings doesn't exist yet
  const { data, error } = await supabase
    .from('org_settings')
    .upsert({ org_id: profile.org_id, ...updates }, { onConflict: 'org_id' })
    .select('social_hashtags, social_tagline, social_footer')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void writeAuditLog({
    orgId:     profile.org_id,
    actorId:   profile.id,
    actorType: 'user',
    action:    'settings_updated',
    metadata:  { changed_keys: Object.keys(updates) },
  })

  return NextResponse.json({
    social_hashtags: data.social_hashtags ?? '',
    social_tagline:  data.social_tagline  ?? '',
    social_footer:   data.social_footer   ?? '',
  })
}
