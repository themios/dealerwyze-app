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
  stepLabel?: string   // e.g. "Day 1 - New Lead Follow-up"
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

async function buildGmailRawMessage(args: {
  fromName: string
  fromAddress: string
  to: string
  replyTo: string
  subject: string
  text: string
  html: string
}): Promise<string> {
  const composerTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  })

  const info = await composerTransport.sendMail({
    from: { name: args.fromName, address: args.fromAddress },
    to: args.to,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.text,
    html: args.html,
  })

  const raw = info.message
  if (!Buffer.isBuffer(raw)) {
    throw new Error('Failed to compose raw email message.')
  }
  return raw.toString('base64url')
}

function parseProviderError(err: unknown): string {
  const e = err as {
    message?: string
    response?: { data?: unknown }
    errors?: Array<{ message?: string }>
  }
  const data = e.response?.data as { error?: { message?: string } } | undefined
  return data?.error?.message || e.errors?.[0]?.message || e.message || 'Unknown provider error'
}

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export async function sendSequenceEmail(
  args: SendSequenceEmailArgs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId, customerId, customerEmail, customerName, subject, body, activityId, stepLabel } = args
  const supabase = createServiceClient()

  // Fetch email account
  const { data: account } = await supabase
    .from('email_accounts')
    .select('id, email, oauth_refresh_token, imap_host, imap_port, imap_user, imap_pass')
    .eq('org_id', orgId)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()

  if (!account) {
    return { ok: false, error: 'no_account' }
  }

  // Fetch org settings + customer vehicle for variable substitution
  const [{ data: orgSettings }, { data: customerVehicle }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('email_signature, business_name, dealer_cell_number')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('customer_vehicles')
      .select('vehicle:vehicles(year, make, model)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const firstName = customerName.split(' ')[0] || customerName
  const vehicleRow = customerVehicle?.vehicle as { year?: number; make?: string; model?: string } | null
  const vehicleLabel = vehicleRow
    ? `${vehicleRow.year ?? ''} ${vehicleRow.make ?? ''} ${vehicleRow.model ?? ''}`.trim()
    : ''
  const dealerName  = orgSettings?.business_name ?? ''
  const dealerPhone = orgSettings?.dealer_cell_number ?? ''

  const vars: Record<string, string> = {
    firstName,
    vehicle:     vehicleLabel,
    dealerName,
    dealerPhone,
    link:        '',  // placeholder — no public VDP link in scope yet
  }

  const resolvedSubject = substituteVars(subject, vars)
  const resolvedBody    = substituteVars(body, vars)

  const signature = orgSettings?.email_signature ?? null
  const htmlBody  = buildEmailHtml(resolvedBody, signature)
  const plainText = signature
    ? `${resolvedBody}\n\n--\n${signature.replace(/<[^>]+>/g, '')}`
    : resolvedBody

  const fromAddress = account.email ?? account.imap_user ?? ''
  if (!fromAddress) {
    return { ok: false, error: 'no_from_address' }
  }
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

    try {
      const rawMessage = await buildGmailRawMessage({
        fromName: 'Your Sales Team',
        fromAddress,
        to: customerEmail,
        replyTo: fromAddress,
        subject: resolvedSubject,
        text: plainText,
        html: htmlBody,
      })

      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage },
      })
      messageId = sent.data.id ?? null
      threadId  = sent.data.threadId ?? null
      await supabase
        .from('email_accounts')
        .update({ last_error: null })
        .eq('id', account.id)
    } catch (err) {
      await supabase
        .from('email_accounts')
        .update({ last_error: `[gmail-send-sequence] ${parseProviderError(err)}`.slice(0, 1000) })
        .eq('id', account.id)
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
        subject: resolvedSubject,
        text:    plainText,
        html:    htmlBody,
      })
      messageId = info.messageId ?? null
      await supabase
        .from('email_accounts')
        .update({ last_error: null })
        .eq('id', account.id)
    } catch {
      await supabase
        .from('email_accounts')
        .update({ last_error: '[smtp-send-sequence] SMTP provider rejected send request' })
        .eq('id', account.id)
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

  // Log a separate sent record so the activity feed shows the actual email.
  // Prefix with [Auto: stepLabel] so the timeline can identify and label it.
  const bodyPrefix = stepLabel ? `[Auto: ${stepLabel}]\n` : ''
  await supabase.from('activities').insert({
    user_id:          orgId,
    customer_id:      customerId,
    type:             'email',
    direction:        'outbound',
    body:             `${bodyPrefix}Subject: ${resolvedSubject}\n\n${resolvedBody}`,
    completed_at:     new Date().toISOString(),
    priority:         'normal',
    gmail_message_id: messageId,
    gmail_thread_id:  threadId,
  })

  return { ok: true }
}
