/**
 * Customer reply polling — Gmail OAuth and IMAP paths
 *
 * Scans the connected inbox for emails from known customers and creates
 * inbound email activities, routing each to the customer's assigned rep.
 *
 * Runs alongside the lead poll in runLeadPollForOrg (sync-leads cron, every 15min).
 */

import { google } from 'googleapis'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createServiceClient } from '@/lib/supabase/service'
import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'

export async function pollCustomerRepliesForOrg(
  orgId: string,
  gmailClient: ReturnType<typeof google.gmail>,
): Promise<{ processed: number }> {
  const supabase = createServiceClient()

  // Look at all inbox messages from the last 2 days.
  // Do NOT filter by is:unread — if the dealer reads the email before the cron fires
  // it would be missed. We rely on gmail_message_id dedup instead.
  const listRes = await gmailClient.users.messages.list({
    userId: 'me',
    q: 'in:inbox newer_than:2d',
    maxResults: 50,
  }).catch(() => null)

  const messages = listRes?.data?.messages ?? []
  if (messages.length === 0) return { processed: 0 }

  // Load all customer emails for this org in one query (avoid N+1)
  // NOTE: customers table uses user_id (= org_id post-migration-008), not org_id
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, assigned_to')
    .eq('user_id', orgId)
    .not('email', 'is', null)
    .is('merged_at', null)

  if (!customers?.length) return { processed: 0 }

  // Build lookup: normalized email → {customer_id, customer_name, assigned_to}
  const emailMap = new Map<string, { customer_id: string; customer_name: string; assigned_to: string | null }>()
  for (const c of customers) {
    if (c.email) emailMap.set(c.email.toLowerCase().trim(), { customer_id: c.id, customer_name: c.name, assigned_to: c.assigned_to })
  }

  // Get existing gmail_message_ids to avoid duplicate activities
  // activities has no org_id column — scope by customer_id instead
  const customerIds = [...emailMap.values()].map(v => v.customer_id)
  const { data: existing } = await supabase
    .from('activities')
    .select('gmail_message_id')
    .in('customer_id', customerIds)
    .not('gmail_message_id', 'is', null)
  const seenIds = new Set((existing ?? []).map(a => a.gmail_message_id as string))

  let processed = 0

  for (const msgRef of messages) {
    if (!msgRef.id) continue

    // Fetch full message
    const full = await gmailClient.users.messages.get({
      userId: 'me',
      id: msgRef.id,
      format: 'raw',
    }).catch(() => null)

    if (!full?.data?.raw) continue

    const rawBuffer = Buffer.from(full.data.raw, 'base64url')
    const parsed    = await simpleParser(rawBuffer).catch(() => null)
    if (!parsed) continue

    const fromEmail    = (parsed.from?.value?.[0]?.address ?? '').toLowerCase().trim()
    const gmailMsgId   = parsed.messageId ?? `gmail-${msgRef.id}`
    const gmailThreadId = full.data.threadId ?? null

    // Only process emails from known customers
    const match = emailMap.get(fromEmail)
    if (!match) continue

    // Skip if already recorded
    if (seenIds.has(gmailMsgId)) continue

    const subject  = parsed.subject ?? '(no subject)'
    const htmlText = typeof parsed.html === 'string'
      ? parsed.html.replace(/<[^>]+>/g, ' ')
      : ''
    const body = (parsed.text?.trim() || htmlText.trim() || '')

    await supabase.from('activities').insert({
      user_id:          orgId,
      customer_id:      match.customer_id,
      type:             'email',
      direction:        'inbound',
      body:             `Subject: ${subject}\n\n${body}`,
      completed_at:     new Date().toISOString(),
      priority:         'normal',
      gmail_message_id: gmailMsgId,
      gmail_thread_id:  gmailThreadId,
    })

    // Stop autoresponder — customer replied via email
    await stopSequenceOnReply({
      supabase,
      orgId,
      customerId:   match.customer_id,
      customerName: match.customer_name,
      channel:      'email',
    })

    // Mark as read so we don't process it again on next poll
    await gmailClient.users.messages.modify({
      userId: 'me',
      id: msgRef.id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    }).catch(() => null)

    seenIds.add(gmailMsgId)
    processed++
  }

  return { processed }
}

/** IMAP version — used for Yahoo, custom domains, Gmail app passwords */
export async function pollCustomerRepliesViaImap(
  orgId: string,
  account: { imap_host: string; imap_port: number; imap_user: string; imap_pass: string },
): Promise<{ processed: number }> {
  const supabase = createServiceClient()

  // NOTE: customers table uses user_id (= org_id post-migration-008), not org_id
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, assigned_to')
    .eq('user_id', orgId)
    .not('email', 'is', null)
    .is('merged_at', null)

  if (!customers?.length) return { processed: 0 }

  const emailMap = new Map<string, { customer_id: string; customer_name: string; assigned_to: string | null }>()
  for (const c of customers) {
    if (c.email) emailMap.set(c.email.toLowerCase().trim(), { customer_id: c.id, customer_name: c.name, assigned_to: c.assigned_to })
  }

  // activities has no org_id column — scope by customer_id instead
  const customerIds = [...emailMap.values()].map(v => v.customer_id)
  const { data: existing } = await supabase
    .from('activities')
    .select('gmail_message_id')
    .in('customer_id', customerIds)
    .not('gmail_message_id', 'is', null)
  const seenIds = new Set((existing ?? []).map(a => a.gmail_message_id as string))

  const client = new ImapFlow({
    host:   account.imap_host,
    port:   account.imap_port,
    secure: true,
    auth:   { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  let processed = 0

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Do NOT filter by seen:false — Thunderbird/desktop clients mark emails as read
      // before the cron fires, causing replies to be missed. Rely on message-ID dedup instead.
      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      const uidsRaw = await client.search({ since })
      const uids = (Array.isArray(uidsRaw) ? uidsRaw : []).slice(-50)

      for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
        const fromAddr = (msg.envelope?.from?.[0]?.address ?? '').toLowerCase().trim()
        const match = emailMap.get(fromAddr)
        if (!match) continue

        if (!msg.source) continue
        const parsed    = await simpleParser(msg.source).catch(() => null)
        if (!parsed) continue

        const msgId = parsed.messageId ?? `imap-${account.imap_host}-${msg.uid}`
        if (seenIds.has(msgId)) continue

        const subject  = parsed.subject ?? '(no subject)'
        const htmlText = typeof parsed.html === 'string'
          ? parsed.html.replace(/<[^>]+>/g, ' ')
          : ''
        const body = (parsed.text?.trim() || htmlText.trim() || '')

        await supabase.from('activities').insert({
          user_id:          orgId,
          customer_id:      match.customer_id,
          type:             'email',
          direction:        'inbound',
          body:             `Subject: ${subject}\n\n${body}`,
          completed_at:     new Date().toISOString(),
          priority:         'normal',
          gmail_message_id: msgId,
          gmail_thread_id:  null,
        })

        // Stop autoresponder — customer replied via email
        await stopSequenceOnReply({
          supabase,
          orgId,
          customerId:   match.customer_id,
          customerName: match.customer_name,
          channel:      'email',
        })

        await client.messageFlagsAdd(String(msg.uid), ['\\Seen']).catch(() => null)
        seenIds.add(msgId)
        processed++
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch {
    // Non-fatal — lead poll continues
  }

  return { processed }
}
