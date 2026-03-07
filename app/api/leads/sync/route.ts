import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'
import { getSyncError } from '@/lib/syncErrors'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYNC_TIMEOUT_MS = 45_000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

// Authenticated proxy — browser calls this, secret never leaves the server
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  type PollOut = Awaited<ReturnType<typeof runLeadPollForOrg>>
  const result = await withTimeout<PollOut | { _timeout: true }>(
    runLeadPollForOrg(profile.org_id),
    SYNC_TIMEOUT_MS,
    { _timeout: true },
  )

  if (result && '_timeout' in result && result._timeout) {
    const service = createServiceClient()
    const { data: accounts } = await service
      .from('email_accounts')
      .select('email')
      .eq('org_id', profile.org_id)
      .eq('enabled', true)
    const accountEmail = (accounts ?? []).map((a: { email?: string }) => a.email).filter(Boolean).join(', ')
    const detail = getSyncError('SYNC_001', { accountEmail: accountEmail || undefined })
    return NextResponse.json(
      { error: detail.message, errorDetail: detail },
      { status: 500 },
    )
  }

  if (result && 'error' in result && result.error) {
    const detail = getSyncError('SYNC_002', {
      technicalReason: result.error,
      accountEmail: result.accountEmail,
    })
    return NextResponse.json(
      { error: detail.message, errorDetail: detail },
      { status: 500 },
    )
  }

  return NextResponse.json(result)
}
