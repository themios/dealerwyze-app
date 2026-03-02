/**
 * Twilio Programmable Fax API
 * Docs: https://www.twilio.com/docs/fax/api/fax-resource
 *
 * Requires mediaUrl to be publicly reachable. We use a short-lived Supabase
 * signed URL (1 hour) — Twilio fetches the document within seconds/minutes.
 */

export interface SendFaxResult {
  ok: boolean
  sid?: string
  status?: string
  error?: string
}

export async function sendFax(
  toNumber: string,
  fromNumber: string,
  mediaUrl: string,
  callbackUrl: string,
): Promise<SendFaxResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    return { ok: false, error: 'Twilio credentials not configured' }
  }

  const res = await fetch(`https://fax.twilio.com/v1/Faxes`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To:             toNumber,
      From:           fromNumber,
      MediaUrl:       mediaUrl,
      StatusCallback: callbackUrl,
      Quality:        'fine',
    }),
  })

  const data = await res.json() as { sid?: string; status?: string; message?: string }

  if (!res.ok) {
    console.error('[fax/send] Twilio error:', res.status, data.message)
    return { ok: false, error: data.message ?? `Twilio ${res.status}` }
  }

  return { ok: true, sid: data.sid, status: data.status }
}
