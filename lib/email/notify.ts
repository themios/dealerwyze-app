/**
 * Lightweight transactional email helper via Resend.
 * Non-fatal: silently skips if RESEND_API_KEY is not set.
 * Attachments: content must be base64-encoded string (Resend API).
 * Pass org_id + email_type to log the send to platform_email_log for admin visibility.
 */

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function sendNotificationEmail({
  to,
  subject,
  html,
  from,
  attachments,
  org_id,
  email_type,
  reply_to,
  vertical,
}: {
  to: string
  subject: string
  html: string
  from?: string
  attachments?: { filename: string; content: string }[]
  org_id?: string
  email_type?: string
  reply_to?: string
  vertical?: 'dealer' | 'real_estate'
}): Promise<{ resendId?: string }> {
  const isRealtyWyze = vertical === 'real_estate'
  const key =
    (isRealtyWyze ? process.env.REALTYWYZE_RESEND_API_KEY : null) ??
    process.env.RESEND_API_KEY
  if (!key) return {}

  const brandName = isRealtyWyze ? 'RealtyWyze' : 'DealerWyze'
  const domain = isRealtyWyze ? (process.env.REALTYWYZE_RESEND_FROM_DOMAIN ?? 'realtywyze.us') : (process.env.RESEND_FROM_DOMAIN ?? 'dealerwyze.com')
  const fromAddress = from ?? `${brandName} <noreply@${domain}>`
  let resendId: string | undefined
  try {
    const body: {
      from: string; to: string[]; subject: string; html: string
      reply_to?: string
      attachments?: { filename: string; content: string }[]
    } = { from: fromAddress, to: [to], subject, html }
    if (reply_to) body.reply_to = reply_to
    if (attachments?.length) body.attachments = attachments
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = (await res.json()) as { id?: string }
      resendId = data.id
    }
  } catch {
    // Non-fatal
  }

  // Log to platform_email_log for admin comms history
  if (org_id && email_type) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service')
      await createServiceClient()
        .from('platform_email_log')
        .insert({
          org_id,
          to_email:  to,
          subject,
          email_type,
          body_text: htmlToText(html).slice(0, 8000),
        })
    } catch {
      // Non-fatal
    }
  }

  return { resendId }
}
