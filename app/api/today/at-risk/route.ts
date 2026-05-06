import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { fetchAtRiskLeads } from '@/lib/today/atRisk'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const items = await fetchAtRiskLeads(supabase, profile.org_id)
  return NextResponse.json(items)
}
