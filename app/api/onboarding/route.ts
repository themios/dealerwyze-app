import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

/** GET — return current onboarding step + org settings */
export async function GET() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', profile.org_id).single(),
    supabase.from('org_settings').select('*').eq('org_id', profile.org_id).maybeSingle(),
  ])

  return NextResponse.json({ org, settings })
}

/** PATCH — advance step, update settings, or mark complete */
export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()
  const body = await req.json() as {
    step?: number
    complete?: boolean
    settings?: {
      business_name?: string
      business_phone?: string
      business_address?: string
      timezone?: string
    }
  }

  const updates: Record<string, unknown> = {}

  if (body.step !== undefined)  updates.onboarding_step = body.step
  if (body.complete)            updates.onboarding_completed_at = new Date().toISOString()
  if (body.settings) {
    const s = body.settings
    if (s.business_name    !== undefined) updates.business_name    = s.business_name
    if (s.business_phone   !== undefined) updates.business_phone   = s.business_phone
    if (s.business_address !== undefined) updates.business_address = s.business_address
    if (s.timezone         !== undefined) updates.timezone         = s.timezone
  }

  const { error } = await supabase
    .from('org_settings')
    .update(updates)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
