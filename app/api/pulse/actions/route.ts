import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const VALID_CATS = new Set(['first_contact','rep','vehicle','process','facility','post_sale'])

export async function GET() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('pulse_actions')
    .select('*, assignee:profiles!assigned_to(id, display_name)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { category, plan_text, assigned_to, due_at, score_before } = body

  if (!VALID_CATS.has(category))  return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  if (!plan_text?.trim())          return NextResponse.json({ error: 'plan_text required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pulse_actions')
    .insert({
      org_id:       profile.org_id,
      category,
      plan_text:    plan_text.trim(),
      assigned_to:  assigned_to ?? null,
      due_at:       due_at ?? null,
      score_before: score_before ?? null,
      status:       'plan',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
