import { google } from 'googleapis'
import { simpleParser } from 'mailparser'
import { parseAnyLead, parseCarGurusDigest } from '@/lib/leads/parser'
import { ingestLead } from '@/lib/leads/ingest'
import { createServiceClient } from '@/lib/supabase/service'
import { pollImapAccount } from '@/lib/leads/pollImap'
import { pollCustomerRepliesForOrg, pollCustomerRepliesViaImap } from '@/lib/leads/pollReplies'

export interface PollResult {
  external_id: string
  status: string
  name?: string
  email?: string
  source?: string
  subject?: string
  from?: string
}

/**
 * Core Gmail API polling logic — used by runLeadPollForOrg for all tenants.
 */
async function pollWithClient(
  gmail: ReturnType<typeof google.gmail>,
  orgId: string,
  options: { dryRun?: boolean; scanMode?: boolean },
): Promise<{ processed: number; results: PollResult[] } | { error: string }> {
  const { dryRun = false, scanMode = false } = options
  const results: PollResult[] = []

  try {
    // Exclude facebookmail.com — each FB Marketplace email triggers Gmail push; they have no contact info and cause a webhook storm. Broad skip in ingest is safety net.
    const senderQuery = 'from:cargurus.com OR from:autotrader.com OR from:offerup.com OR from:kbb.com OR from:autolist.com OR from:carsforsalemail.com'
    const q = scanMode
      ? 'newer_than:2d'
      : `(${senderQuery}) newer_than:2d`

    const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 20 })
    const messages = listRes.data.messages || []
    if (messages.length === 0) return { processed: 0, results: [] }

    for (const msgRef of messages) {
      const full = await gmail.users.messages.get({ userId: 'me', id: msgRef.id!, format: 'raw' })

      const rawBuffer = Buffer.from(full.data.raw!, 'base64url')
      const parsed    = await simpleParser(rawBuffer)

      const subject   = parsed.subject || ''
      const fromEmail = (parsed.from?.value?.[0]?.address || '').toLowerCase()
      const messageId = parsed.messageId || `gmail-${msgRef.id}`

      let text = parsed.text || ''
      if (
        subject.toLowerCase().includes('leadai') &&
        !text.includes('has submitted a new lead') &&
        parsed.html
      ) {
        text = parsed.html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/gi, '\n')
          .replace(/<td[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
          .replace(/[ \t]+/g, ' ')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }

      if (scanMode) {
        results.push({ external_id: messageId, status: 'scan', subject, from: fromEmail, source: 'unknown' })
        continue
      }

      const markRead = () => gmail.users.messages.modify({
        userId: 'me',
        id: msgRef.id!,
        requestBody: { removeLabelIds: ['UNREAD'] },
      })

      const digestLeads = parseCarGurusDigest(subject, text)
      if (digestLeads.length > 0) {
        for (let i = 0; i < digestLeads.length; i++) {
          const extId = `${messageId}-digest-${i}`
          if (dryRun) {
            results.push({ external_id: extId, status: 'dry-run', name: digestLeads[i].name, email: digestLeads[i].email, source: 'cargurus_digest' })
          } else {
            const data = await ingestLead(digestLeads[i], extId, orgId)
            results.push({ external_id: extId, status: 'error' in data ? 'error' : data.status, name: digestLeads[i].name, email: digestLeads[i].email, source: 'cargurus_digest', ...('error' in data ? { from: data.error } : {}) })
          }
        }
        if (!dryRun) await markRead()
        continue
      }

      const lead = parseAnyLead(subject, text, fromEmail)
      if (!lead) {
        if (dryRun) {
          results.push({ external_id: messageId, status: 'no-match', from: fromEmail, subject, source: text.slice(0, 1200) })
        } else {
          await markRead()
        }
        continue
      }

      if (dryRun) {
        results.push({ external_id: messageId, status: 'dry-run', name: lead.name, email: lead.email, source: lead.source })
      } else {
        const data = await ingestLead(lead, messageId, orgId)
        results.push({ external_id: messageId, status: 'error' in data ? 'error' : data.status, name: lead.name, email: lead.email, source: lead.source, ...('error' in data ? { from: data.error } : {}) })
        await markRead()
      }
    }
  } catch (err) {
    return { error: String(err) }
  }

  return { processed: results.length, results }
}

/**
 * Poll all connected email accounts for a given org.
 * Handles both Gmail OAuth accounts and IMAP accounts.
 * All tenants go through this path — no single-tenant fallback.
 */
export type LeadPollSuccess = { processed: number; results: PollResult[] }
export type LeadPollError = { error: string; accountEmail?: string }
export type LeadPollResult = LeadPollSuccess | LeadPollError

export async function runLeadPollForOrg(orgId: string): Promise<LeadPollResult> {
  const supabase = createServiceClient()

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id, org_id, email, provider, oauth_refresh_token, imap_host, imap_port, imap_user, imap_pass')
    .eq('org_id', orgId)
    .eq('enabled', true)

  if (!accounts?.length) return { processed: 0, results: [] }

  const allResults: PollResult[] = []

  for (const account of accounts) {
    const accountEmail = account.email ?? account.imap_user ?? ''
    let result: { processed: number; results: PollResult[] } | { error: string }

    if (account.oauth_refresh_token) {
      // Gmail OAuth path
      const auth = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
      )
      auth.setCredentials({ refresh_token: account.oauth_refresh_token })
      const gmailClient = google.gmail({ version: 'v1', auth })
      // Run lead poll and customer reply poll in parallel
      const [leadResult] = await Promise.all([
        pollWithClient(gmailClient, orgId, {}),
        pollCustomerRepliesForOrg(orgId, gmailClient).catch(() => null),
      ])
      result = leadResult
    } else if (account.imap_host && account.imap_user && account.imap_pass) {
      // IMAP path (Yahoo, Apple, Outlook, generic, or Gmail app password)
      const imapAccount = {
        id:        account.id,
        org_id:    orgId,
        imap_host: account.imap_host,
        imap_port: account.imap_port ?? 993,
        imap_user: account.imap_user,
        imap_pass: account.imap_pass,
      }
      const [leadResult] = await Promise.all([
        pollImapAccount(imapAccount),
        pollCustomerRepliesViaImap(orgId, imapAccount).catch(() => null),
      ])
      result = leadResult
    } else {
      continue
    }

    // Update poll status on the account
    await supabase
      .from('email_accounts')
      .update({
        last_polled_at: new Date().toISOString(),
        last_error:     'error' in result ? result.error : null,
      })
      .eq('id', account.id)

    if ('error' in result) return { error: result.error, accountEmail }
    allResults.push(...result.results)
  }

  return { processed: allResults.length, results: allResults }
}
