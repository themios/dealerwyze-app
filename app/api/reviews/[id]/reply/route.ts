import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { replyToGbpReview } from '@/lib/google/gbp'
import { requireProfile } from '@/lib/auth/profile'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Look up per-org GBP credentials
  const [{ data: token }, { data: orgSettings }] = await Promise.all([
    supabase.from('org_google_tokens').select('calendar_refresh_token').eq('org_id', profile.org_id).maybeSingle(),
    supabase.from('org_settings').select('gbp_location_id, gbp_account_id').eq('org_id', profile.org_id).maybeSingle(),
  ])
  const creds = token?.calendar_refresh_token && orgSettings?.gbp_location_id
    ? { refreshToken: token.calendar_refresh_token, locationId: orgSettings.gbp_location_id, accountId: orgSettings.gbp_account_id ?? 'accounts/-' }
    : undefined   // falls back to env vars in replyToGbpReview

  const ok = await replyToGbpReview(row.review_id, reply, creds)
  if (!ok) return NextResponse.json({ error: 'GBP API error' }, { status: 502 })

  const { error: updateError } = await supabase
    .from('gbp_reviews')
    .update({ reply_comment: reply, reply_time: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    console.error('[reviews/reply] DB update failed after GBP post:', updateError)
    return NextResponse.json({ error: 'Reply posted but failed to save locally' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
