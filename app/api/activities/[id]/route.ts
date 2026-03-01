import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as { completed_at?: string; outcome?: string }

  const updates: Record<string, unknown> = {}
  if (body.completed_at !== undefined) updates.completed_at = body.completed_at
  if (body.outcome !== undefined) updates.outcome = body.outcome

  const { error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
