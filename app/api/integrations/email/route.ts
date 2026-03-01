import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { testImapConnection } from '@/lib/leads/pollImap'

/**
 * GET /api/integrations/email
 * List all connected email accounts for the current org.
 */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('email_accounts')
    .select('id, label, email, provider, enabled, last_polled_at, last_error')
    .eq('org_id', profile.org_id)
    .order('created_at')

  return NextResponse.json(data ?? [])
}

/**
 * POST /api/integrations/email
 * Add an IMAP account. Tests the connection before saving.
 *
 * Body: { label?, email, provider, imap_host, imap_port?, imap_user, imap_pass }
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    label?:     string
    email:      string
    provider:   string
    imap_host:  string
    imap_port?: number
    imap_user:  string
    imap_pass:  string
  }

  if (!body.email || !body.imap_host || !body.imap_user || !body.imap_pass) {
    return NextResponse.json({ error: 'email, imap_host, imap_user, and imap_pass are required' }, { status: 400 })
  }

  // Test connection before saving credentials
  const port = body.imap_port ?? 993
  const test = await testImapConnection(body.imap_host, port, body.imap_user, body.imap_pass)
  if (!test.ok) {
    return NextResponse.json({ error: `Connection failed: ${test.error}` }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('email_accounts')
    .insert({
      org_id:    profile.org_id,
      label:     body.label || body.email,
      email:     body.email,
      provider:  body.provider,
      imap_host: body.imap_host,
      imap_port: port,
      imap_user: body.imap_user,
      imap_pass: body.imap_pass,
    })
    .select('id, label, email, provider, enabled, last_polled_at, last_error')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
