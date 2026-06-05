/**
 * Low-level Twilio outbound SMS (form-encoded API).
 * Used by BHPH ACH flows; does not log activities.
 */
export async function sendTwilioSms(
  toE164: string,
  body: string,
  options?: { from?: string | null; messagingServiceSid?: string | null },
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom =
    options?.from?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    null
  const messagingServiceSid =
    options?.messagingServiceSid?.trim() ||
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ||
    null

  if (!twilioSid || !twilioToken) {
    return { ok: false, error: 'twilio_unconfigured' }
  }
  if (!twilioFrom && !messagingServiceSid) {
    return { ok: false, error: 'twilio_unconfigured' }
  }

  const params: Record<string, string> = { To: toE164, Body: body }
  if (messagingServiceSid) {
    params.MessagingServiceSid = messagingServiceSid
  } else {
    params.From = twilioFrom!
  }

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
      },
    )
    const twilioData = (await twilioRes.json()) as { sid?: string; message?: string; code?: number }
    if (twilioRes.ok) {
      return { ok: true, sid: twilioData.sid }
    }
    return {
      ok: false,
      error: typeof twilioData.message === 'string' ? twilioData.message : 'twilio_send_failed',
    }
  } catch {
    return { ok: false, error: 'twilio_network_error' }
  }
}

export function toE164Us(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.startsWith('1')) return `+${digits}`
  return null
}
