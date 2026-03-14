/**
 * GET /api/customers/search?q=name_or_phone&limit=20
 * Returns minimal customer data for pickers/sheets.
 * Org-scoped via requireProfile().
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 50)

  // customers table uses user_id for org scoping (not org_id)
  let query = supabase
    .from('customers')
    .select('id, name, primary_phone')
    .eq('user_id', profile.org_id)
    .eq('archived', false)
    .limit(limit)
    .order('name')

  if (q) {
    query = query.or(`name.ilike.%${q}%,primary_phone.ilike.%${q}%`)
  }

  const { data } = await query

  return NextResponse.json(data ?? [])
}
