import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { parseAnyLead, parseCarGurusDigest } from '@/lib/leads/parser'
import { ingestLead } from '@/lib/leads/ingest'
import type { PollResult } from '@/lib/leads/poll'

interface ImapAccount {
  id:        string
  org_id:    string
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass: string
}

const LEAD_DOMAINS = ['cargurus.com', 'autotrader.com', 'offerup.com']

/**
 * Poll an IMAP mailbox for new lead emails.
 * Fetches unseen messages from the last 2 days, filters by known lead domains,
 * ingests matches, and marks them seen.
 */
export async function pollImapAccount(
  account: ImapAccount,
): Promise<{ processed: number; results: PollResult[] } | { error: string }> {
  const results: PollResult[] = []
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

  const client = new ImapFlow({
    host:   account.imap_host,
    port:   account.imap_port,
    secure: true,
    auth:   { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const uidsRaw = await client.search({ since, seen: false })
      const uids = Array.isArray(uidsRaw) ? uidsRaw : []
      if (!uids.length) return { processed: 0, results: [] }

      // Cap at 20 most recent to avoid long runs
      const recentUids = uids.slice(-20)

      for await (const msg of client.fetch(recentUids, { source: true, envelope: true })) {
        const fromAddr = (msg.envelope?.from?.[0]?.address ?? '').toLowerCase()
        const isLeadSource = LEAD_DOMAINS.some(d => fromAddr.includes(d))
        if (!isLeadSource) continue

        if (!msg.source) continue
        const parsed    = await simpleParser(msg.source)
        const subject   = parsed.subject || ''
        const messageId = parsed.messageId || `imap-${account.imap_host}-${msg.uid}`
        const text      = parsed.text || ''

        // Mark seen immediately so re-runs don't re-process
        await client.messageFlagsAdd(String(msg.uid), ['\\Seen'])

        const digestLeads = parseCarGurusDigest(subject, text)
        if (digestLeads.length > 0) {
          for (let i = 0; i < digestLeads.length; i++) {
            const extId = `${messageId}-digest-${i}`
            const data  = await ingestLead(digestLeads[i], extId, account.org_id)
            results.push({
              external_id: extId,
              status:      'error' in data ? 'error' : data.status,
              name:        digestLeads[i].name,
              email:       digestLeads[i].email,
              source:      'cargurus_digest',
            })
          }
          continue
        }

        const lead = parseAnyLead(subject, text, fromAddr)
        if (lead) {
          const data = await ingestLead(lead, messageId, account.org_id)
          results.push({
            external_id: messageId,
            status:      'error' in data ? 'error' : data.status,
            name:        lead.name,
            email:       lead.email,
            source:      lead.source,
          })
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    return { error: String(err) }
  }

  return { processed: results.length, results }
}

/**
 * Test IMAP credentials without saving anything.
 * Used by the POST /api/integrations/email handler to validate before storing.
 */
export async function testImapConnection(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 10000,
  })
  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
