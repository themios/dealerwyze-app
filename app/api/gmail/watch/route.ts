import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export const runtime = 'nodejs'

// Call POST /api/gmail/watch?secret=... once to register Gmail push notifications.
// Must be renewed every 7 days — re-call this endpoint to renew.
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.LEADS_POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  const gmail = google.gmail({ version: 'v1', auth })

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: process.env.PUBSUB_TOPIC!,
      labelIds: ['INBOX'],
    },
  })

  return NextResponse.json(res.data)
}
