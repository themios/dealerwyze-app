import { OAuth2Client } from 'google-auth-library'
import { after, NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processGmailHistory } from '@/lib/gmail/processHistory'
import { logOrgAudit } from '@/lib/audit/orgAudit'

const googleOidcClient = new OAuth2Client()
const GOOGLE_PUBSUB_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])
const DEFAULT_PUBSUB_PUSH_EMAIL = 'gmail-api-push@system.gserviceaccount.com'

interface PubsubMessageBody {
  message?: { data?: string; messageId?: string; publishTime?: string }
  subscription?: string
}

async function verifyGoogleOidc(authHeader: string | null, audience: string): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)

  try {
    const ticket = await googleOidcClient.verifyIdToken({ idToken: token, audience })
    const payload = ticket.getPayload()
    if (!payload) return false

    const issuer = payload.iss ?? ''
    if (!GOOGLE_PUBSUB_ISSUERS.has(issuer)) return false

    const expectedEmail = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL?.trim() || DEFAULT_PUBSUB_PUSH_EMAIL
    if (payload.email !== expectedEmail || payload.email_verified !== true) return false

    return true
  } catch {
    return false
  }
}

async function decodePushPayload(req: NextRequest): Promise<{ emailAddress: string; historyId: string } | null> {
  const body = await req.json().catch(() => null) as PubsubMessageBody | null
  const messageData = body?.message?.data
  if (!messageData) return null

  try {
    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString()) as {
      emailAddress?: string
      historyId?: number | string
    }
    if (!decoded.emailAddress || decoded.historyId == null) return null
    return {
      emailAddress: decoded.emailAddress,
      historyId: String(decoded.historyId),
    }
  } catch {
    return null
  }
}

async function enqueueHistoryProcessing(emailAddress: string, historyId: string) {
  const supabase = createServiceClient()
  const { data: account } = await supabase
    .from('email_accounts')
    .select('id, org_id, oauth_refresh_token, gmail_history_id')
    .eq('enabled', true)
    .not('oauth_refresh_token', 'is', null)
    .or(`email.eq.${emailAddress},imap_user.eq.${emailAddress}`)
    .maybeSingle()

  if (!account?.oauth_refresh_token || !account.org_id) return

  const historyNumber = Number(historyId)
  const fallbackStartHistoryId =
    Number.isFinite(historyNumber) && historyNumber > 1 ? String(historyNumber - 1) : '1'
  const startHistoryId = account.gmail_history_id ?? fallbackStartHistoryId

  await processGmailHistory(
    account.org_id,
    account.id,
    account.oauth_refresh_token,
    startHistoryId,
  )
}

export async function handleGmailPushWebhook(
  req: NextRequest,
  audiencePath: '/api/gmail/webhook',
) {
  const audience = `${process.env.NEXT_PUBLIC_APP_URL}${audiencePath}`
  const authorized = await verifyGoogleOidc(req.headers.get('authorization'), audience)

  if (!authorized) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    void logOrgAudit({ org_id: null,
      actor_type: 'webhook', action: 'gmail_webhook_auth_failure', ip,
      details: { audience } }).catch(() => {})
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await decodePushPayload(req)
  if (!payload) return NextResponse.json({ ok: true })

  after(async () => {
    try {
      await enqueueHistoryProcessing(payload.emailAddress, payload.historyId)
    } catch (err) {
      console.error('[gmail/push] processGmailHistory error:', err instanceof Error ? err.message : err)
    }
  })

  return NextResponse.json({ ok: true })
}
