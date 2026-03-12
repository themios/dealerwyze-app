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

const LEAD_DOMAINS = [
  'cargurus.com',
  'messages.cargurus.com',
  'autotrader.com',
  'messages.autotrader.com',
  'offerup.com',
  'messages.offerup.com',
  'kbb.com',
  'autolist.com',
  'carsforsalemail.com',
  'facebookmail.com',
]

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
      const uidsRaw = await client.search({ since })
      const uids = Array.isArray(uidsRaw) ? uidsRaw : []
      if (!uids.length) return { processed: 0, results: [] }

      const recentUids = uids.slice(-20)

      for await (const msg of client.fetch(recentUids, { source: true, envelope: true })) {
        const fromAddr = (msg.envelope?.from?.[0]?.address ?? '').toLowerCase()
        const isLeadSource = LEAD_DOMAINS.some(d => fromAddr.includes(d))
        if (!isLeadSource) continue

        if (!msg.source) continue
        const parsed    = await simpleParser(msg.source)
        const subject   = parsed.subject || ''
        const messageId = parsed.messageId || `imap-${account.imap_host}-${msg.uid}`
        let text        = parsed.text || ''
        if (!text && parsed.html) {
          text = parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        }

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

function formatImapError(err: unknown, host?: string): string {
  if (err instanceof Error) {
    const msg = err.message?.trim() || String(err)
    const extra = (err as { response?: { text?: string } }).response?.text
      || (err as { responseText?: string }).responseText
    const cause = (err as { cause?: Error }).cause?.message
    let out = extra ? `${msg}: ${extra}` : cause ? `${msg} (${cause})` : msg
    const isGmail = host && (host.includes('gmail.com') || host.includes('google'))
    const isYahoo = host && host.includes('yahoo')
    const isInvalidCreds = msg.includes('Invalid credentials') || msg.includes('Authentication failed')
    const outHasInvalidCreds = out.includes('Invalid credentials') || out.includes('Authentication failed') || out.includes('AUTHENTICATE')
    const isVague = msg === 'Command failed' || msg.includes('Authentication') || msg.includes('Invalid credentials')
    if (isGmail && isVague) {
      if (isInvalidCreds) {
        out += ' For Gmail: use an App Password (not your regular password) at myaccount.google.com → Security → 2-Step Verification → App passwords; ensure IMAP is enabled in Gmail → Settings → See all settings → Forwarding and POP/IMAP.'
      } else if (!out.includes('App Password')) {
        out += ' For Gmail, use an App Password (myaccount.google.com → Security → 2-Step Verification → App passwords).'
      }
    }
    if (isYahoo && (isInvalidCreds || isVague || outHasInvalidCreds) && !out.includes('App Password')) {
      out += ' Yahoo requires an App Password, not your regular account password. Go to account.yahoo.com → Account Security → Generate app password, then enter that here.'
    }
    return out
  }
  return String(err)
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
    return { ok: false, error: formatImapError(err, host) }
  }
}
