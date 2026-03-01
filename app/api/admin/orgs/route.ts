import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()

  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data, error } = await service
    .from('organizations')
    .select(`
      id,
      name,
      plan,
      subscription_status,
      trial_ends_at,
      current_period_end,
      created_at,
      org_settings (
        business_phone
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orgs = (data ?? []).map((org) => {
    const settings = Array.isArray(org.org_settings)
      ? org.org_settings[0]
      : org.org_settings

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      subscription_status: org.subscription_status,
      trial_ends_at: org.trial_ends_at ?? null,
      current_period_end: org.current_period_end ?? null,
      business_phone: settings?.business_phone ?? null,
      created_at: org.created_at,
    }
  })

  return NextResponse.json(orgs)
}
