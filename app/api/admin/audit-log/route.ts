import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q')?.trim() ?? ''
  const limit  = Math.min(Number(searchParams.get('limit') ?? '50'), 200)

  const supabase = createServiceClient()

  let query = supabase
    .from('admin_audit_log')
    .select(`
      id,
      action,
      details,
      created_at,
      admin_user_id,
      target_org_id,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (search) {
    query = query.ilike('action', `%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
