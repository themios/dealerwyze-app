import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runLeadPoll } from '@/lib/leads/poll'

export const runtime = 'nodejs'
export const maxDuration = 55

// Authenticated proxy — browser calls this, secret never leaves the server
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runLeadPoll({
    dryRun: req.nextUrl.searchParams.get('dry') === '1',
    scanMode: req.nextUrl.searchParams.get('scan') === '1',
  })

  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
