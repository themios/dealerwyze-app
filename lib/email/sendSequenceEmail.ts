/**
 * sendSequenceEmail — send a queued sequence email from the cron job.
 *
 * Used by check-tasks Job 11. Not called from browser routes.
 * Returns { ok: true } on success or { ok: false, error: string } — never throws.
 */

import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { createServiceClient } from '@/lib/supabase/service'

interface SendSequenceEmailArgs {
  orgId: string
  customerId: string
  customerEmail: string
  customerName: string
  subject: string
  body: string
  activityId: string
  sequenceDay: number
}

/** Convert plain-text body + optional HTML signature into an HTML email. */
function buildEmailHtml(body: string, signature: string | null): string {
  const bodyHtml = body
    .split(/\n\n+/)
    .map(para =>
      `<p>${para
        .split('\n')
        .map(line =>
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

function smtpHostFrom(imapHost: string): string {
  return imapHost.replace(/^imap\./, 'smtp.')
}

export async function sendSequenceEmail(
  args: SendSequenceEmailArgs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId, customerId, customerEmail, subject, body, activityId } = args
  const supabase = createServiceClient()

  // Fetch email account
  const { data: account } = await supabase
    .from('email_accounts')
    .select('email, oauth_refresh_token, imap_host, imap_port, imap_user, imap_pass')
    .eq('org_id', orgId)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()

  if (!account) {
    return { ok: false, error: 'no_account' }
  }

  // Fetch email signature
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('email_signature')
    .eq('org_id', orgId)
    .maybeSingle()

  const signature = orgSettings?.email_signature ?? null
  const htmlBody  = buildEmailHtml(body, signature)
  const plainText = signature
    ? `${body}\n\n--\n${signature.replace(/<[^>]+>/g, '')}`
    : body

  const fromAddress = account.email ?? account.imap_user ?? ''
  const fromHeader  = `"Your Sales Team" <${fromAddress}>`

  let messageId: string | null = null
  let threadId: string | null  = null

  if (account.oauth_refresh_token) {
    // Gmail OAuth path
    const auth = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: account.oauth_refresh_token })
    const gmail = google.gmail({ version: 'v1', auth })

    const encodeHeader = (v: string) =>
      /[^\x20-\x7E]/.test(v)
        ? `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`
        : v

    const boundary = `boundary_${Date.now().toString(36)}`
    const rawMessage = [
      `From: ${encodeHeader(fromHeader)}`,
      `To: ${customerEmail}`,
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
      return { ok: false, error: 'gmail_send_failed' }
    }
  } else if (account.imap_host && account.imap_user && account.imap_pass) {
    // SMTP path
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
        to:      customerEmail,
        replyTo: fromAddress,
        subject,
        text:    plainText,
        html:    htmlBody,
      })
      messageId = info.messageId ?? null
    } catch (err) {
      return { ok: false, error: 'smtp_send_failed' }
    }
  } else {
    return { ok: false, error: 'no_account' }
  }

  // Mark activity as sent
  await supabase
    .from('activities')
    .update({
      completed_at:     new Date().toISOString(),
      gmail_message_id: messageId,
      gmail_thread_id:  threadId,
    })
    .eq('id', activityId)

  // Log a separate sent record so the activity feed shows the actual email
  await supabase.from('activities').insert({
    user_id:          orgId,
    customer_id:      customerId,
    type:             'email',
    direction:        'outbound',
    body:             `Subject: ${subject}\n\n${body}`,
    completed_at:     new Date().toISOString(),
    priority:         'normal',
    gmail_message_id: messageId,
    gmail_thread_id:  threadId,
  })

  return { ok: true }
}
