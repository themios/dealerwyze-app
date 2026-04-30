import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/** GET — return current onboarding step + org settings */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', profile.org_id).single(),
    supabase.from('org_settings').select('*').eq('org_id', profile.org_id).maybeSingle(),
  ])

  return NextResponse.json({ org, settings })
}

/** PATCH — advance step, update settings, or mark complete */
export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const body = await req.json() as {
    step?: number
    complete?: boolean
    orgName?: string
    settings?: {
      business_name?: string
      business_phone?: string
      business_address?: string
      zip_code?: string
      timezone?: string
      voice_business_hours_start?: string
      voice_business_hours_end?: string
    }
  }

  const updates: Record<string, unknown> = {}

  if (body.step !== undefined) updates.onboarding_step = body.step
  if (body.complete)           updates.onboarding_completed_at = new Date().toISOString()
  if (body.settings) {
    const s = body.settings
    if (s.business_name              !== undefined) updates.business_name              = s.business_name
    if (s.business_phone             !== undefined) updates.business_phone             = s.business_phone
    if (s.business_address           !== undefined) updates.business_address           = s.business_address
    if (s.zip_code                   !== undefined) updates.zip_code                   = s.zip_code
    if (s.timezone                   !== undefined) updates.timezone                   = s.timezone
    if (s.voice_business_hours_start !== undefined) updates.voice_business_hours_start = s.voice_business_hours_start
    if (s.voice_business_hours_end   !== undefined) updates.voice_business_hours_end   = s.voice_business_hours_end
  }

  if (body.orgName) {
    await supabase.from('organizations').update({ name: body.orgName }).eq('id', profile.org_id)
  }

  const { error } = await supabase
    .from('org_settings')
    .update(updates)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
