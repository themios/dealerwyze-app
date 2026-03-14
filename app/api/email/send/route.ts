import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

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

export async function POST(req: Request) {
  const profile = await requireProfile()
  const service  = createServiceClient()

  const body = await req.json().catch(() => ({}))
  const { customer_id, subject, emailBody: rawEmailBody, vehicle_id, include_unsubscribe_footer, customer_id_for_unsub } = body as {
    customer_id: string
    subject: string
    emailBody: string
    vehicle_id?: string
    include_unsubscribe_footer?: boolean
    customer_id_for_unsub?: string
  }
  // Build unsubscribe footer when requested
  const unsubCid = customer_id_for_unsub ?? customer_id
  let emailBody = rawEmailBody
  if (include_unsubscribe_footer && unsubCid) {
    const unsubSecret = process.env.UNSUBSCRIBE_SECRET ?? 'fallback-secret'
    const token = crypto.createHmac('sha256', unsubSecret).update(unsubCid).digest('hex')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
    const unsubLink = `${appUrl}/api/unsubscribe?token=${token}&cid=${unsubCid}`
    emailBody = `${rawEmailBody}\n\n---\nTo stop receiving follow-up emails, click here: ${unsubLink}`
  }

  if (!customer_id || !subject?.trim() || !emailBody?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  // Verify customer belongs to this org — customers table uses user_id for org scoping (no org_id column)
  const { data: customer } = await service
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
  const [{ data: account }, { data: orgSettings }] = await Promise.all([
    service
      .from('email_accounts')
      .select('email, oauth_refresh_token, imap_host, imap_port, imap_user, imap_pass')
      .eq('org_id', profile.org_id)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle(),
    service
      .from('org_settings')
      .select('email_signature')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
  ])

  if (!account) {
    return NextResponse.json(
      { error: 'No connected email account found. Go to Settings → Integrations to connect your email.' },
      { status: 422 },
    )
  }

  const signature = orgSettings?.email_signature ?? null
  const htmlBody  = buildEmailHtml(emailBody, signature)
  // Plain-text fallback: body + stripped signature (strip HTML tags)
  const plainText = signature
    ? `${emailBody}\n\n--\n${signature.replace(/<[^>]+>/g, '')}`
    : emailBody

  // Get sender's display name
  const { data: authUser } = await service.auth.admin.getUserById(profile.id)
  const senderName = authUser?.user?.user_metadata?.full_name
    ?? authUser?.user?.email?.split('@')[0]
    ?? 'Your Sales Team'

  const fromAddress = account.email ?? account.imap_user ?? ''
  const fromHeader  = `"${senderName}" <${fromAddress}>`

  let messageId: string | null = null
  let threadId: string | null  = null

  if (account.oauth_refresh_token) {
    // ── Gmail OAuth path — multipart/alternative (text + html) ─────────────
    const auth = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: account.oauth_refresh_token })
    const gmail = google.gmail({ version: 'v1', auth })

    // RFC 2047 encode header values containing non-ASCII characters
    const encodeHeader = (v: string) =>
      /[^\x20-\x7E]/.test(v)
        ? `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`
        : v

    const boundary = `boundary_${Date.now().toString(36)}`
    const rawMessage = [
      `From: ${encodeHeader(fromHeader)}`,
      `To: ${toEmail}`,
      `Cc: support@dealerwyze.com`,
      `Reply-To: ${fromAddress}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      plainText,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      htmlBody,
      '',
      `--${boundary}--`,
    ].join('\r\n')

    try {
      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
      })
      messageId = sent.data.id ?? null
      threadId  = sent.data.threadId ?? null
    } catch (err) {
      console.error('[email/send] Gmail OAuth error:', err)
      return NextResponse.json(
        { error: 'Could not send email. Please try again or reconnect Gmail in Settings - Integrations.' },
        { status: 502 },
      )
    }
  } else if (account.imap_host && account.imap_user && account.imap_pass) {
    // ── SMTP path (Yahoo, custom domain, Gmail app password) ──────────────────
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
        cc:      'support@dealerwyze.com',
        replyTo: fromAddress,
        subject,
        text:    plainText,
        html:    htmlBody,
      })
      messageId = info.messageId ?? null
    } catch (err) {
      return NextResponse.json(
        { error: 'Could not send email. Please check your email connection in Settings → Integrations.' },
        { status: 502 },
      )
    }
  } else {
    return NextResponse.json(
      { error: 'No connected email account found. Go to Settings → Integrations to connect your email.' },
      { status: 422 },
    )
  }

  // Mark the customer's pending inbound lead as addressed so it leaves the Today screen
  await service
    .from('activities')
    .update({ addressed_at: new Date().toISOString() })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customer_id)
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

  // Log outbound activity (plain text only — no HTML in activity feed)
  // user_id must be org_id to satisfy RLS policy: user_id = get_org_id()
  await service.from('activities').insert({
    user_id:          profile.org_id,
    customer_id,
    vehicle_id:       vehicle_id ?? null,
    type:             'email',
    direction:        'outbound',
    body:             `Subject: ${subject}\n\n${emailBody}`,
    completed_at:     new Date().toISOString(),
    priority:         'normal',
    gmail_message_id: messageId,
    gmail_thread_id:  threadId,
  })

  return NextResponse.json({ ok: true })
}
