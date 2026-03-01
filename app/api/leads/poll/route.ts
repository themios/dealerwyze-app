import { NextRequest, NextResponse } from 'next/server'
import { runLeadPoll } from '@/lib/leads/poll'

export const runtime = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.LEADS_POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runLeadPoll({
    dryRun: req.nextUrl.searchParams.get('dry') === '1',
    scanMode: req.nextUrl.searchParams.get('scan') === '1',
  })

  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
