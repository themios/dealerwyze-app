import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchGbpReviews } from '@/lib/google/gbp'
import { sendLeadNotification } from '@/lib/push/send'

export const runtime     = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Accept Vercel native cron (Authorization: Bearer CRON_SECRET)
  // or legacy external cron (x-cron-secret: LEADS_POLL_SECRET)
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const orgId    = process.env.APOLLO_USER_ID
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 500 })

  const reviews = await fetchGbpReviews()
  let newCount = 0

  for (const review of reviews) {
    // Atomic insert: if the UNIQUE index (org_id, review_id) fires we get error.code '23505'
    // This eliminates the SELECT+INSERT race condition when two cron invocations overlap.
    const { data: inserted, error: insertError } = await supabase
      .from('gbp_reviews')
      .insert({
        org_id:        orgId,
        review_id:     review.reviewId,
        author_name:   review.authorName,
        is_anonymous:  review.isAnonymous,
        rating:        review.rating,
        comment:       review.comment,
        create_time:   review.createTime,
        update_time:   review.updateTime,
        reply_comment: review.replyComment,
        reply_time:    review.replyTime,
        notified_at:   null,
      })
      .select('id')
      .maybeSingle()

    if (!insertError && inserted) {
      // Genuinely new review — notify then stamp notified_at
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
      await sendLeadNotification({
        title: `New ${stars} Review`,
        body:  review.comment
          ? `${review.authorName}: "${review.comment.slice(0, 80)}${review.comment.length > 80 ? '…' : ''}"`
          : `${review.authorName} left a ${review.rating}-star review`,
        url:   '/today',
      })
      await supabase
        .from('gbp_reviews')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', inserted.id)
      newCount++
    } else if (insertError?.code === '23505') {
      // Duplicate: review already in DB — sync reply state if it changed on GBP side
      const { data: existing } = await supabase
        .from('gbp_reviews')
        .select('reply_comment')
        .eq('org_id', orgId)
        .eq('review_id', review.reviewId)
        .maybeSingle()
      if (existing && review.replyComment !== existing.reply_comment) {
        await supabase
          .from('gbp_reviews')
          .update({ reply_comment: review.replyComment, reply_time: review.replyTime })
          .eq('org_id', orgId)
          .eq('review_id', review.reviewId)
      }
    } else if (insertError) {
      console.error('[poll-reviews] unexpected insert error:', insertError)
    }
  }

  return NextResponse.json({ reviews_fetched: reviews.length, new_reviews: newCount })
}
