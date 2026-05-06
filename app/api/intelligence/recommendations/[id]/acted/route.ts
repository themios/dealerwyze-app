import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { error } = await supabase
    .from('recommendations')
    .update({ acted_on_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .is('acted_on_at', null)

  if (error) {
    console.error('[recommendations] acted failed:', error.message)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
