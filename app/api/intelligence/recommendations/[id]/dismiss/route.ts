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
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[recommendations] dismiss failed:', error.message)
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
