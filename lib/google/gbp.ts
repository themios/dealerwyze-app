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

export interface GbpCredentials {
  refreshToken: string
  locationId:   string   // e.g. "locations/3595854674576679340"
  accountId?:   string   // e.g. "accounts/123" — defaults to wildcard "accounts/-"
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: refreshToken })
  return new Promise((resolve, reject) => {
    oauth2.getAccessToken((err, token) => {
      if (err || !token) reject(err ?? new Error('No access token'))
      else resolve(token)
    })
  })
}

/**
 * Fetch GBP reviews for a specific org using their stored credentials.
 * No env var fallbacks — each org must have credentials in org_google_tokens + org_settings.
 */
export async function fetchGbpReviews(creds?: GbpCredentials): Promise<GbpReview[]> {
  const refreshToken = creds?.refreshToken ?? null
  const locationId   = creds?.locationId   ?? null
  const accountId    = creds?.accountId    ?? 'accounts/-'

  if (!locationId) {
    console.warn('[gbp] locationId not configured for org — skipping')
    return []
  }
  if (!refreshToken) {
    console.warn('[gbp] refreshToken not configured for org — skipping')
    return []
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(refreshToken)
  } catch (err) {
    console.error('[gbp] Failed to get access token:', err)
    return []
  }

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

export async function replyToGbpReview(reviewId: string, replyText: string, creds?: GbpCredentials): Promise<boolean> {
  const refreshToken = creds?.refreshToken ?? null
  const locationId   = creds?.locationId   ?? null
  const accountId    = creds?.accountId    ?? 'accounts/-'

  if (!locationId || !refreshToken) return false

  let accessToken: string
  try {
    accessToken = await getAccessToken(refreshToken)
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
