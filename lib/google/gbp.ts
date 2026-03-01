import { google } from 'googleapis'

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

export interface GbpReview {
  reviewId:     string
  authorName:   string
  isAnonymous:  boolean
  rating:       number   // 1–5
  comment:      string | null
  createTime:   string   // ISO
  updateTime:   string | null
  replyComment: string | null
  replyTime:    string | null
}

async function getAccessToken(): Promise<string> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_CALENDAR_REFRESH_TOKEN })
  return new Promise((resolve, reject) => {
    oauth2.getAccessToken((err, token) => {
      if (err || !token) reject(err ?? new Error('No access token'))
      else resolve(token)
    })
  })
}

export async function fetchGbpReviews(): Promise<GbpReview[]> {
  const locationId = process.env.GBP_LOCATION_ID
  if (!locationId) {
    console.warn('[gbp] GBP_LOCATION_ID not set — skipping')
    return []
  }
  // GBP_ACCOUNT_ID is optional — defaults to "accounts/-" (wildcard across all accounts).
  // Set it explicitly if the wildcard causes permission errors.
  const accountId = process.env.GBP_ACCOUNT_ID ?? 'accounts/-'

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error('[gbp] Failed to get access token:', err)
    return []
  }

  // GBP My Business API v4 reviews endpoint.
  // locationId env var format: "locations/3595854674576679340"
  // If Google has migrated your account to the v1 Business Profile API, change to:
  //   https://mybusiness.googleapis.com/v1/${locationId}/reviews
  const url = `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews?pageSize=50`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    console.error('[gbp] fetchGbpReviews failed:', res.status, await res.text())
    return []
  }

  const data = await res.json() as {
    reviews?: Array<{
      reviewId:     string
      reviewer:     { displayName: string; isAnonymous: boolean }
      starRating:   string
      comment?:     string
      createTime:   string
      updateTime?:  string
      reviewReply?: { comment: string; updateTime: string }
    }>
  }

  return (data.reviews ?? []).map(r => ({
    reviewId:     r.reviewId,
    authorName:   r.reviewer?.displayName ?? 'Anonymous',
    isAnonymous:  r.reviewer?.isAnonymous ?? false,
    rating:       STAR_MAP[r.starRating] ?? 3,
    comment:      r.comment ?? null,
    createTime:   r.createTime,
    updateTime:   r.updateTime ?? null,
    replyComment: r.reviewReply?.comment ?? null,
    replyTime:    r.reviewReply?.updateTime ?? null,
  }))
}

export async function replyToGbpReview(reviewId: string, replyText: string): Promise<boolean> {
  const locationId = process.env.GBP_LOCATION_ID
  if (!locationId) return false
  const accountId = process.env.GBP_ACCOUNT_ID ?? 'accounts/-'

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error('[gbp] Failed to get access token for reply:', err)
    return false
  }

  const url = `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews/${reviewId}/reply`
  const res = await fetch(url, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  })

  if (!res.ok) {
    console.error('[gbp] replyToGbpReview failed:', res.status, await res.text())
    return false
  }
  return true
}
