/**
 * GET/PATCH /api/settings/website
 * Dealer website settings: public inventory toggle, tagline, custom domain.
 * Dealer admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'

const ALLOWED_KEYS = ['public_inventory_enabled', 'website_tagline', 'custom_domain'] as const

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('slug, public_inventory_enabled, website_tagline, custom_domain')
    .eq('id', profile.org_id)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(org)
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()

  // Only allow whitelisted keys
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      updates[key] = body[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  // Sanitize custom_domain: lowercase, strip protocol, trailing slashes
  if (typeof updates.custom_domain === 'string') {
    updates.custom_domain = updates.custom_domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .trim() || null
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
