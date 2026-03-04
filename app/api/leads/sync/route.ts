import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runLeadPollForOrg } from '@/lib/leads/poll'

export const runtime = 'nodejs'
export const maxDuration = 55

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

  const result = await runLeadPollForOrg(profile.org_id)

  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
