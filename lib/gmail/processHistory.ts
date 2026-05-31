/**
 * processGmailHistory — Gmail History API processor for push notifications
 *
 * Called by the Gmail Pub/Sub webhook when Google delivers a
 * notification that new messages arrived. Uses the History API to fetch only
 * the delta since the last known historyId — much more targeted than polling.
 *
 * Replicates the customer-matching + activity-insert pattern from pollReplies.ts
 * but operates on specific messages from the history feed rather than a broad
 * inbox search.
 */

import { google } from 'googleapis'
import { simpleParser } from 'mailparser'
import { createServiceClient } from '@/lib/supabase/service'
import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'
import { parseAnyLead, parseCarGurusDigest } from '@/lib/leads/parser'
import { parseZillowLead } from '@/lib/leads/parseZillow'
import { parseRealtorComLead } from '@/lib/leads/parseRealtorCom'
import { parseBoomtownLead } from '@/lib/leads/parseBoomtown'
import { ingestLead } from '@/lib/leads/ingest'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { getLeadSourceEmailMatchers, matchesLeadSourceEmail } from '@/lib/leads/sourceMatchers'
import { enqueueConversationRescore } from '@/lib/leads/conversationScore'

// Keywords that suggest an inbound inquiry from an unknown sender
const LEAD_KEYWORDS = ['price', 'interested', 'available', 'how much', 'financing', 'finance', 'cost', 'inquiry', 'asking', 'payment']

function buildOAuthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function looksLikeLead(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase()
  return LEAD_KEYWORDS.some(kw => text.includes(kw))
}

export async function processGmailHistory(
  orgId: string,
  accountId: string,
  refreshToken: string,
  startHistoryId: string,
): Promise<{ processed: number; leads: number }> {
  const supabase = createServiceClient()
  const auth = buildOAuthClient(refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })
  const { data: settings } = await supabase
    .from('org_settings')
    .select('lead_source_email_matchers')
    .eq('org_id', orgId)
    .maybeSingle()
  const sourceMatchers = getLeadSourceEmailMatchers(settings?.lead_source_email_matchers)

  // Fetch history since last known historyId
  const historyRes = await gmail.users.history.list({
    userId: 'me',
    startHistoryId,
    historyTypes: ['messageAdded'],
    labelId: 'INBOX',
  }).catch((err) => {
    console.error('[processHistory] history.list error:', err?.message ?? err)
    return null
  })

  if (!historyRes?.data) return { processed: 0, leads: 0 }

  const historyRecords = historyRes.data.history ?? []
  const latestHistoryId = historyRes.data.historyId ?? startHistoryId

  // Collect all new message IDs from the history records
  const newMessageIds: string[] = []
  for (const record of historyRecords) {
    for (const added of record.messagesAdded ?? []) {
      if (added.message?.id) {
        newMessageIds.push(added.message.id)
      }
    }
  }

  if (newMessageIds.length === 0) {
    // No new messages — still update historyId so next call starts from here
    await supabase
      .from('email_accounts')
      .update({ gmail_history_id: String(latestHistoryId) })
      .eq('id', accountId)
    return { processed: 0, leads: 0 }
  }

  // Load all customer emails for this org in one query (avoid N+1)
  // NOTE: customers table uses user_id (= org_id), not org_id column
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, assigned_to')
    .eq('user_id', orgId)
    .not('email', 'is', null)

  // Build lookup: normalized email → customer data
  const emailMap = new Map<string, { customer_id: string; customer_name: string; assigned_to: string | null }>()
  for (const c of customers ?? []) {
    if (c.email) {
      emailMap.set(c.email.toLowerCase().trim(), {
        customer_id: c.id,
        customer_name: c.name,
        assigned_to: c.assigned_to,
      })
    }
  }

  // Load existing gmail_message_ids to avoid duplicate activities
  // activities has no org_id column — scope by customer_id
  const customerIds = [...emailMap.values()].map(v => v.customer_id)
  let seenIds = new Set<string>()
  if (customerIds.length > 0) {
    const { data: existing } = await supabase
      .from('activities')
      .select('gmail_message_id')
      .in('customer_id', customerIds)
      .not('gmail_message_id', 'is', null)
    seenIds = new Set((existing ?? []).map(a => a.gmail_message_id as string))
  }

  // Cache org admin id to avoid repeated lookups
  let orgAdminId: string | null = null
  async function getOrgAdmin(): Promise<string | null> {
    if (orgAdminId !== null) return orgAdminId
    const { data: admin } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('role', 'dealer_admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    orgAdminId = admin?.id ?? null
    return orgAdminId
  }

  let processed = 0
  let leads = 0

  for (const msgId of newMessageIds) {
    // Fetch the full message
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msgId,
      format: 'raw',
    }).catch(() => null)

    if (!full?.data?.raw) continue

    const rawBuffer = Buffer.from(full.data.raw, 'base64url')
    const parsed = await simpleParser(rawBuffer).catch(() => null)
    if (!parsed) continue

    const fromEmail = (parsed.from?.value?.[0]?.address ?? '').toLowerCase().trim()
    const gmailMsgId = parsed.messageId ?? `gmail-${msgId}`
    const gmailThreadId = full.data.threadId ?? null

    const subject = parsed.subject ?? '(no subject)'
    const htmlText = typeof parsed.html === 'string'
      ? parsed.html.replace(/<[^>]+>/g, ' ')
      : ''
    const body = parsed.text?.trim() || htmlText.trim() || ''

    // ── Known customer reply ──────────────────────────────────────────────
    const match = emailMap.get(fromEmail)
    if (match) {
      if (seenIds.has(gmailMsgId)) continue

      let userId = match.assigned_to
      if (!userId) {
        userId = await getOrgAdmin()
      }
      if (!userId) continue

      await supabase.from('activities').insert({
        user_id: userId,
        customer_id: match.customer_id,
        type: 'email',
        direction: 'inbound',
        body: `Subject: ${subject}\n\n${body}`,
        completed_at: new Date().toISOString(),
        priority: 'normal',
        gmail_message_id: gmailMsgId,
        gmail_thread_id: gmailThreadId,
      })

      await stopSequenceOnReply({
        supabase,
        orgId,
        customerId: match.customer_id,
        customerName: match.customer_name,
        channel: 'email',
      })

      enqueueConversationRescore({
        customerId: match.customer_id,
        orgId,
        trigger: 'inbound_email',
      })

      // Mark as read to keep inbox clean
      await gmail.users.messages.modify({
        userId: 'me',
        id: msgId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      }).catch(() => null)

      seenIds.add(gmailMsgId)
      processed++
      continue
    }

    // ── Unknown sender — check for lead inquiry ───────────────────────────
    if (!fromEmail || !matchesLeadSourceEmail(fromEmail, sourceMatchers)) continue

    // Dedup by gmail_message_id across all activities for this org's customers
    // (crude but avoids re-creating leads from the same email on every push)
    const { data: dupCheck } = await supabase
      .from('activities')
      .select('id')
      .eq('gmail_message_id', gmailMsgId)
      .limit(1)
      .maybeSingle()
    if (dupCheck) continue

    const digestLeads = parseCarGurusDigest(subject, body)
    if (digestLeads.length > 0) {
      for (let i = 0; i < digestLeads.length; i++) {
        const extId = `${gmailMsgId}-digest-${i}`
        await ingestLead(digestLeads[i], extId, orgId, {
          location: { emailSubject: subject, emailBody: body },
        })
        leads++
      }
    } else {
      // Try specialized RealtyWyze parsers first
      let parsedLead = parseZillowLead(subject, body, fromEmail)
      if (!parsedLead) {
        parsedLead = parseRealtorComLead(subject, body, fromEmail)
      }
      if (!parsedLead) {
        parsedLead = parseBoomtownLead(subject, body, fromEmail)
      }
      // Fall back to generic parser
      if (!parsedLead) {
        parsedLead = parseAnyLead(subject, body, fromEmail)
      }

      if (parsedLead) {
        await ingestLead(parsedLead, gmailMsgId, orgId, {
          location: { emailSubject: subject, emailBody: body },
        })
        leads++
      } else {
        if (!looksLikeLead(subject, body)) continue

        // Get org admin for new lead attribution
        const adminId = await getOrgAdmin()
        if (!adminId) continue

        // Extract name from From header
        const fromName = parsed.from?.value?.[0]?.name?.trim() || fromEmail.split('@')[0]

        // Create new customer record
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            user_id: orgId,
            name: fromName,
            email: fromEmail,
            lead_source: 'email',
            status: 'lead',
          })
          .select('id')
          .single()

        if (!newCustomer) continue

        void applyLeadLocationDetection({
          customerId: newCustomer.id,
          orgId,
          context: { emailSubject: subject, emailBody: body },
          supabase,
        })

        // Create inbound lead activity
        await supabase.from('activities').insert({
          user_id: adminId,
          customer_id: newCustomer.id,
          type: 'email',
          direction: 'inbound',
          body: `Subject: ${subject}\n\n${body}`,
          completed_at: new Date().toISOString(),
          priority: 'normal',
          gmail_message_id: gmailMsgId,
          gmail_thread_id: gmailThreadId,
        })

        leads++
      }
    }

    await gmail.users.messages.modify({
      userId: 'me',
      id: msgId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    }).catch(() => null)
  }

  // Update historyId cursor so next push starts from here
  await supabase
    .from('email_accounts')
    .update({ gmail_history_id: String(latestHistoryId) })
    .eq('id', accountId)

  return { processed, leads }
}
