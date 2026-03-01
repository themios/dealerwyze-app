import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { replyToGbpReview } from '@/lib/google/gbp'
import { requireProfile } from '@/lib/auth/profile'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let profile: Awaited<ReturnType<typeof requireProfile>>
  try {
    profile = await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reply } = await req.json() as { reply?: string }
  if (!reply?.trim()) {
    return NextResponse.json({ error: 'Reply text required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('gbp_reviews')
    .select('review_id')
    .eq('id', params.id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ok = await replyToGbpReview(row.review_id, reply)
  if (!ok) return NextResponse.json({ error: 'GBP API error' }, { status: 502 })

  const { error: updateError } = await supabase
    .from('gbp_reviews')
    .update({ reply_comment: reply, reply_time: new Date().toISOString() })
    .eq('id', params.id)

  if (updateError) {
    console.error('[reviews/reply] DB update failed after GBP post:', updateError)
    return NextResponse.json({ error: 'Reply posted but failed to save locally' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
