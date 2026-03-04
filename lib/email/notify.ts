/**
 * Lightweight transactional email helper via Resend.
 * Non-fatal: silently skips if RESEND_API_KEY is not set.
 */
export async function sendNotificationEmail({
  to,
  subject,
  html,
  from,
}: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const fromAddress = from ?? `DealerWyze <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, html }),
    })
  } catch {
    // Non-fatal — don't let email failure affect the API response
  }
}
