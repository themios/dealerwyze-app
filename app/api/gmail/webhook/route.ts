import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Validate it's a real Pub/Sub push message
  const body = await req.json().catch(() => null)
  if (!body?.message?.data) return NextResponse.json({ ok: true })

  // Decode Pub/Sub message — Gmail sends { emailAddress, historyId }
  let emailAddress: string | null = null
  try {
    const decoded = JSON.parse(Buffer.from(body.message.data, 'base64').toString())
    emailAddress = decoded.emailAddress ?? null
  } catch {}

  if (!emailAddress) return NextResponse.json({ ok: true })

  // Look up which org owns this Gmail account
  const supabase = createServiceClient()
  const { data: account } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('imap_user', emailAddress)
    .eq('enabled', true)
    .maybeSingle()

  if (!account) return NextResponse.json({ ok: true })

  // Respond 200 immediately so Pub/Sub doesn't retry, then poll in background
  after(async () => {
    await runLeadPollForOrg(account.org_id)
  })

  return NextResponse.json({ ok: true })
}
