import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchGbpReviews, GbpCredentials } from '@/lib/google/gbp'
import { sendLeadNotification } from '@/lib/push/send'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

export const runtime     = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('poll-reviews')
  const supabase = createServiceClient()

  // Collect all orgs that have GBP configured.
  // Priority: per-org token from org_google_tokens; fallback to env vars for Tim's org.
  type OrgConfig = { orgId: string; creds: GbpCredentials }
  const orgConfigs: OrgConfig[] = []

  // 1. Orgs with a token in org_google_tokens + gbp_location_id in org_settings
  const { data: tokenRows } = await supabase
    .from('org_google_tokens')
    .select('org_id, calendar_refresh_token')
    .not('calendar_refresh_token', 'is', null)

  if (tokenRows?.length) {
    const tokenOrgIds = tokenRows.map(r => r.org_id)
    const { data: settingsRows } = await supabase
      .from('org_settings')
      .select('org_id, gbp_location_id, gbp_account_id')
      .in('org_id', tokenOrgIds)
      .not('gbp_location_id', 'is', null)

    for (const s of settingsRows ?? []) {
      const token = tokenRows.find(t => t.org_id === s.org_id)
      if (!token) continue
      orgConfigs.push({
        orgId: s.org_id,
        creds: {
          refreshToken: token.calendar_refresh_token!,
          locationId:   s.gbp_location_id!,
          accountId:    s.gbp_account_id ?? 'accounts/-',
        },
      })
    }
  }

  if (!orgConfigs.length) {
    await finishCronRun(runId, 'success', 0)
    return NextResponse.json({ message: 'No orgs with GBP configured' })
  }

  let totalNew = 0
  let totalFetched = 0

  for (const { orgId, creds } of orgConfigs) {
    const reviews = await fetchGbpReviews(creds)
    totalFetched += reviews.length

    for (const review of reviews) {
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
        totalNew++
      } else if (insertError?.code === '23505') {
        // Duplicate — sync reply state if changed
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
  }

  await finishCronRun(runId, 'success', orgConfigs.length)

  return NextResponse.json({
    orgs_processed: orgConfigs.length,
    reviews_fetched: totalFetched,
    new_reviews: totalNew,
  })
}
