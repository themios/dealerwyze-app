import { NextRequest, NextResponse } from 'next/server'
import { runLeadPoll } from '@/lib/leads/poll'

export async function POST(req: NextRequest) {
  // Validate it's a Pub/Sub push message
  const body = await req.json().catch(() => null)
  if (!body?.message) return NextResponse.json({ ok: true })

  // Run the lead poll — Gmail API query already filters is:unread
  // so only genuinely new emails are processed
  await runLeadPoll({ dryRun: false, scanMode: false })

  return NextResponse.json({ ok: true })
}
