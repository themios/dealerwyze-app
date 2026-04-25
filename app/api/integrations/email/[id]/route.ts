import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { testImapConnection } from '@/lib/leads/pollImap'

/**
 * GET /api/integrations/email/[id]
 * Return one email account for editing (no password). Org-scoped.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, label, email, provider, imap_host, imap_port, imap_user, enabled')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

/**
 * PATCH /api/integrations/email/[id]
 * Update email account: label (all), or IMAP fields + optional new password. Org-scoped.
 * Gmail OAuth accounts: only label can be updated.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = (await req.json()) as {
    label?: string
    email?: string
    provider?: string
    imap_host?: string
    imap_port?: number
    imap_user?: string
    imap_pass?: string
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('email_accounts')
    .select('id, provider, oauth_refresh_token, imap_host, imap_port, imap_user')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOAuth = !!existing.oauth_refresh_token
  const updates: Record<string, unknown> = {}

  if (body.label !== undefined) updates.label = body.label.trim() || null

  if (isOAuth) {
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })
    const { data, error } = await supabase
      .from('email_accounts')
      .update(updates)
      .eq('id', id)
      .eq('org_id', profile.org_id)
      .select('id, label, email, provider, enabled, last_polled_at, last_error')
      .single()
    if (error) {
      console.error('[integrations/email PATCH oauth]', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // IMAP account: allow email, provider, imap_host, imap_port, imap_user, imap_pass
  if (body.email !== undefined) updates.email = body.email.trim()
  if (body.provider !== undefined) updates.provider = body.provider
  if (body.imap_host !== undefined) updates.imap_host = body.imap_host.trim() || null
  if (body.imap_port !== undefined) updates.imap_port = Number(body.imap_port) || 993
  if (body.imap_user !== undefined) updates.imap_user = body.imap_user.trim() || null

  if (body.imap_pass !== undefined && body.imap_pass.trim() !== '') {
    const pass = body.imap_pass.trim()
    const host = (body.imap_host ?? existing.imap_host ?? '').trim()
    const port = body.imap_port ?? existing.imap_port ?? 993
    const user = (body.imap_user ?? existing.imap_user ?? '').trim()
    const isGmail = host.includes('gmail.com')
    const imapUser = isGmail ? user.toLowerCase() : user
    const imapPass = isGmail ? pass.replace(/\s/g, '') : pass
    const test = await testImapConnection(host, port, imapUser, imapPass)
    if (!test.ok) {
      return NextResponse.json({ error: `Connection failed: ${test.error}` }, { status: 422 })
    }
    updates.imap_pass = imapPass
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })

  const { data, error } = await supabase
    .from('email_accounts')
    .update(updates)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select('id, label, email, provider, enabled, last_polled_at, last_error')
    .single()

  if (error) {
    console.error('[integrations/email PATCH imap]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json(data)
}

/**
 * DELETE /api/integrations/email/[id]
 * Remove an email account. Org check ensures users can't delete other orgs' accounts.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id }  = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('email_accounts')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[integrations/email DELETE]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
