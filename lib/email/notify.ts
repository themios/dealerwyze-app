/**
 * Lightweight transactional email helper via Resend.
 * Non-fatal: silently skips if RESEND_API_KEY is not set.
 * Attachments: content must be base64-encoded string (Resend API).
 */
export async function sendNotificationEmail({
  to,
  subject,
  html,
  from,
  attachments,
}: {
  to: string
  subject: string
  html: string
  from?: string
  attachments?: { filename: string; content: string }[]
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const fromAddress = from ?? `DealerWyze <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`
  try {
    const body: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: string }[] } = {
      from: fromAddress,
      to: [to],
      subject,
      html,
    }
    if (attachments?.length) body.attachments = attachments
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Non-fatal — don't let email failure affect the API response
  }
}
