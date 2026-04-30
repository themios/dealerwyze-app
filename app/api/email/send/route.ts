import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { requireProfile } from '@/lib/auth/profile'
import { sanitizeEmailSignatureHtml, stripHtmlToText } from '@/lib/security/html'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildUnsubscribeToken } from '@/lib/security/unsubscribe'
import { sanitizeEmailHeaderText } from '@/lib/email/header'

/** Derive SMTP host from IMAP host — covers Yahoo, Gmail app-pw, and most custom setups. */
function smtpHostFrom(imapHost: string): string {
  return imapHost.replace(/^imap\./, 'smtp.')
}

/** Convert plain-text body + optional HTML signature into an HTML email. */
function buildEmailHtml(body: string, signature: string | null): string {
  // Convert paragraphs (double newline) and line breaks
  const bodyHtml = body
    .split(/\n\n+/)
    .map(para =>
      `<p>${para
        .split('\n')
        .map(line =>
          // Auto-link bare URLs
          line.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1">$1</a>')
        )
        .join('<br>')}</p>`
    )
    .join('\n')

  const sigHtml = signature?.trim()
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">${signature}`
    : ''

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:15px;color:#111;max-width:600px;margin:0 auto;padding:16px">
${bodyHtml}
${sigHtml}
</body></html>`
}

interface EmailAttachment {
  filename: string
  contentType: string
  signedUrl?: string
  base64?: string
}

async function resolveAttachments(raw: EmailAttachment[]): Promise<{ filename: string; content: Buffer; contentType: string }[]> {
  const out: { filename: string; content: Buffer; contentType: string }[] = []
  for (const a of raw) {
    try {
      if (a.signedUrl) {
        const res = await fetch(a.signedUrl)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        out.push({ filename: a.filename, content: buf, contentType: a.contentType })
      } else if (a.base64) {
        out.push({ filename: a.filename, content: Buffer.from(a.base64, 'base64'), contentType: a.contentType })
      }
    } catch {
      // skip broken attachment, don't fail the whole send
    }
  }
  return out
}

async function buildGmailRawMessage(args: {
  fromName: string
  fromAddress: string
  to: string
  cc?: string
  replyTo: string
  subject: string
  text: string
  html: string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
  inReplyTo?: string | null
}): Promise<string> {
  const composerTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  })

  const info = await composerTransport.sendMail({
    from: { name: args.fromName, address: args.fromAddress },
    to: args.to,
    cc: args.cc,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.text,
    html: args.html,
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content:  a.content,
      contentType: a.contentType,
    })),
    ...(args.inReplyTo ? {
      inReplyTo: args.inReplyTo,
      references: args.inReplyTo,
    } : {}),
  })

  const raw = info.message
  if (!Buffer.isBuffer(raw)) {
    throw new Error('Failed to compose raw email message.')
  }
  return raw.toString('base64url')
}

function parseProviderError(err: unknown): { summary: string; detail: string; status?: number } {
  const e = err as {
    message?: string
    code?: number | string
    response?: { status?: number; data?: unknown }
    errors?: Array<{ message?: string; reason?: string }>
  }

  const status = e.response?.status
  const data = e.response?.data as { error?: { message?: string; status?: string } } | undefined
  const rawMessage =
    data?.error?.message ||
    e.errors?.[0]?.message ||
    e.message ||
    'Unknown provider error'
  const lower = rawMessage.toLowerCase()

  if (lower.includes('invalid_grant')) {
    return {
      summary: 'Gmail authorization expired or was revoked.',
      detail: rawMessage,
      status: 401,
    }
  }
  if (lower.includes('insufficient authentication scopes') || lower.includes('insufficientpermissions')) {
    return {
      summary: 'Gmail permissions are missing required send scope.',
      detail: rawMessage,
      status: 401,
    }
  }
  if (lower.includes('invalid_client')) {
    return {
      summary: 'Server Gmail OAuth client is misconfigured.',
      detail: rawMessage,
      status: 500,
    }
  }
  if (lower.includes('from header')) {
    return {
      summary: 'Sender address does not match connected Gmail account.',
      detail: rawMessage,
      status: 422,
    }
  }

  return {
    summary: 'Email provider rejected send request.',
    detail: rawMessage,
    status: status && status >= 400 ? status : 502,
  }
}

export async function POST(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()
  /** Service role required for `auth.admin.getUserById` only. */
  const adminAuth = createServiceClient()

  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const { customer_id, subject, emailBody: rawEmailBody, vehicle_id, include_unsubscribe_footer, customer_id_for_unsub, attachments: rawAttachments, reply_thread_id, in_reply_to_id } = body as {
    customer_id: string
    subject: string
    emailBody: string
    vehicle_id?: string
    include_unsubscribe_footer?: boolean
    customer_id_for_unsub?: string
    attachments?: EmailAttachment[]
    reply_thread_id?: string | null
    in_reply_to_id?: string | null
  }
  // Build unsubscribe footer when requested
  const unsubCid = customer_id_for_unsub ?? customer_id
  let emailBody = rawEmailBody
  if (include_unsubscribe_footer && unsubCid) {
    let token: string
    try {
      token = buildUnsubscribeToken(unsubCid)
    } catch {
      return NextResponse.json(
        { error: 'Email unsubscribe links are not configured on this server.' },
        { status: 503 },
      )
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
    const unsubLink = `${appUrl}/api/unsubscribe?token=${token}&cid=${unsubCid}`
    emailBody = `${rawEmailBody}\n\n---\nTo stop receiving follow-up emails, click here: ${unsubLink}`
  }

  if (!customer_id || !subject?.trim() || !emailBody?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  // Verify customer belongs to this org — customers table uses user_id for org scoping (no org_id column)
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email, user_id')
    .eq('id', customer_id)
    .maybeSingle()

  const belongsToOrg =
    customer?.user_id === profile.org_id ||
    customer?.user_id === profile.id   // pre-008 legacy: user_id = auth uid

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found or has no email address.' }, { status: 404 })
  }
  if (!belongsToOrg) {
    return NextResponse.json({ error: 'Customer not found or has no email address.' }, { status: 404 })
  }
  const toEmail = customer.email?.trim().replace(/[\r\n\t]/g, '') ?? ''
  if (!toEmail) {
    return NextResponse.json(
      { error: 'No email address on file for this contact. Add one by editing the lead.' },
      { status: 404 }
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return NextResponse.json(
      { error: `The email address on file looks incorrect: "${toEmail}". Open Edit lead, clear the email field, and re-enter it.` },
      { status: 422 }
    )
  }

  // Fetch email signature and connected email account in parallel
  const [{ data: accounts }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('email_accounts')
      .select('id, email, oauth_refresh_token, imap_host, imap_port, imap_user, imap_pass')
      .eq('org_id', profile.org_id)
      .eq('enabled', true)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('org_settings')
      .select('email_signature')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
  ])

  if (!accounts?.length) {
    return NextResponse.json(
      { error: 'No connected email account found. Go to Settings → Integrations to connect your email.' },
      { status: 422 },
    )
  }

  const signature = sanitizeEmailSignatureHtml(orgSettings?.email_signature ?? null)
  const htmlBody  = buildEmailHtml(emailBody, signature)
  // Plain-text fallback: body + stripped signature (strip HTML tags)
  const plainText = signature
    ? `${emailBody}\n\n--\n${stripHtmlToText(signature)}`
    : emailBody

  // Get sender's display name
  const { data: authUser } = await adminAuth.auth.admin.getUserById(profile.id)
  const senderNameRaw = authUser?.user?.user_metadata?.full_name
    ?? authUser?.user?.email?.split('@')[0]
    ?? 'Your Sales Team'
  const senderName = sanitizeEmailHeaderText(senderNameRaw, 'Your Sales Team')
  const safeSubject = sanitizeEmailHeaderText(subject, 'Message from DealerWyze')

  let messageId: string | null = null
  let threadId: string | null  = null
  let sent = false
  let lastErrorMessage = 'Could not send email. Please check your email connection in Settings → Integrations.'
  let lastErrorStatus = 502

  // Resolve attachments once (fetch signed URLs server-side)
  const resolvedAttachments = rawAttachments?.length
    ? await resolveAttachments(rawAttachments)
    : []

  // Prefer OAuth accounts first, then SMTP as fallback.
  const orderedAccounts = [
    ...accounts.filter(a => !!a.oauth_refresh_token),
    ...accounts.filter(a => !a.oauth_refresh_token),
  ]

  for (const account of orderedAccounts) {
    const fromAddress = account.email ?? account.imap_user ?? ''
    if (!fromAddress) {
      await supabase
        .from('email_accounts')
        .update({ last_error: '[send] missing sender address (email/imap_user)' })
        .eq('id', account.id)
      continue
    }
    const fromHeader = `"${senderName}" <${fromAddress}>`

    if (account.oauth_refresh_token) {
      const auth = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
      )
      auth.setCredentials({ refresh_token: account.oauth_refresh_token })
      const gmail = google.gmail({ version: 'v1', auth })

      try {
        const rawMessage = await buildGmailRawMessage({
          fromName: senderName,
          fromAddress,
          to: toEmail,
          replyTo: fromAddress,
          subject: safeSubject,
          text: plainText,
          html: htmlBody,
          attachments: resolvedAttachments,
          inReplyTo: in_reply_to_id ?? null,
        })

        const gmailSend = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawMessage,
            ...(reply_thread_id ? { threadId: reply_thread_id } : {}),
          },
        })
        messageId = gmailSend.data.id ?? null
        threadId  = gmailSend.data.threadId ?? null
        sent = true
        await supabase
          .from('email_accounts')
          .update({ last_error: null })
          .eq('id', account.id)
        break
      } catch (err) {
        console.error('[email/send] Gmail OAuth error:', err)
        const parsed = parseProviderError(err)
        lastErrorMessage = `${parsed.summary} Reconnect Gmail in Settings → Integrations if needed.`
        lastErrorStatus = parsed.status ?? 502
        await supabase
          .from('email_accounts')
          .update({ last_error: `[gmail-send] ${parsed.summary} ${parsed.detail}`.slice(0, 1000) })
          .eq('id', account.id)
        continue
      }
    }

    if (account.imap_host && account.imap_user && account.imap_pass) {
      const smtpHost = smtpHostFrom(account.imap_host)
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: 587,
        secure: false,
        auth: { user: account.imap_user, pass: account.imap_pass },
      })

      try {
        const info = await transporter.sendMail({
          from:    fromHeader,
          to:      toEmail,
          replyTo: fromAddress,
          subject: safeSubject,
          text:    plainText,
          html:    htmlBody,
          attachments: resolvedAttachments.map(a => ({
            filename: a.filename,
            content:  a.content,
            contentType: a.contentType,
          })),
          ...(in_reply_to_id ? {
            inReplyTo:  in_reply_to_id,
            references: in_reply_to_id,
          } : {}),
        })
        messageId = info.messageId ?? null
        sent = true
        await supabase
          .from('email_accounts')
          .update({ last_error: null })
          .eq('id', account.id)
        break
      } catch {
        lastErrorMessage = 'Could not send email. Please check your email connection in Settings → Integrations.'
        lastErrorStatus = 502
        await supabase
          .from('email_accounts')
          .update({ last_error: '[smtp-send] SMTP provider rejected send request' })
          .eq('id', account.id)
        continue
      }
    }
  }

  if (!sent) {
    return NextResponse.json(
      { error: lastErrorMessage },
      { status: lastErrorStatus },
    )
  }

  // Mark the customer's pending inbound lead as addressed so it leaves the Today screen
  await supabase
    .from('activities')
    .update({ addressed_at: new Date().toISOString() })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customer_id)
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

  // Log outbound activity (plain text only — no HTML in activity feed)
  // user_id must be org_id to satisfy RLS policy: user_id = get_org_id()
  await supabase.from('activities').insert({
    user_id:          profile.org_id,
    customer_id,
    vehicle_id:       vehicle_id ?? null,
    type:             'email',
    direction:        'outbound',
    body:             `Subject: ${safeSubject}\n\n${emailBody}`,
    completed_at:     new Date().toISOString(),
    priority:         'normal',
    gmail_message_id: messageId,
    gmail_thread_id:  threadId ?? reply_thread_id ?? null,
  })

  return NextResponse.json({ ok: true })
}
