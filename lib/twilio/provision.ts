/**
 * Twilio phone number provisioning.
 * Uses the platform's master Twilio account to buy numbers for orgs.
 * Each org gets its own number; inbound routing is done by To= in /api/twilio/inbound.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN!
const APP_BASE    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

function auth() {
  return `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`
}

function twilioUrl(path: string) {
  return `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}${path}`
}

export interface AvailableNumber {
  phoneNumber: string   // e.g. "+18334561234"
  friendlyName: string  // e.g. "(833) 456-1234"
}

/**
 * Search for available Twilio numbers.
 * type='toll_free' → instant 10DLC-exempt messaging.
 * type='local'     → area_code required; slower (needs 10DLC for SMS).
 */
export async function searchAvailableNumbers(
  type: 'toll_free' | 'local',
  areaCode?: string
): Promise<AvailableNumber[]> {
  const kind = type === 'toll_free' ? 'TollFree' : 'Local'
  const params = new URLSearchParams({ SmsEnabled: 'true', VoiceEnabled: 'true', PageSize: '5' })
  if (type === 'local' && areaCode) params.set('AreaCode', areaCode)

  const res = await fetch(twilioUrl(`/AvailablePhoneNumbers/US/${kind}.json?${params}`), {
    headers: { Authorization: auth() },
  })
  const data = await res.json() as { available_phone_numbers?: Array<{ phone_number: string; friendly_name: string }> }
  return (data.available_phone_numbers ?? []).map(n => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
  }))
}

/**
 * Purchase a Twilio phone number and configure its SMS + voice webhooks.
 */
export async function buyNumber(
  phoneNumber: string,
  friendlyName: string
): Promise<{ sid: string; phoneNumber: string }> {
  const body = new URLSearchParams({
    PhoneNumber:  phoneNumber,
    FriendlyName: friendlyName,
    // SMS inbound → our router (routes by To= to correct org)
    SmsUrl:    `${APP_BASE}/api/twilio/inbound`,
    SmsMethod: 'POST',
    // Voice placeholder — configured per-org in Phase 3C (Retell setup)
    VoiceUrl:    `${APP_BASE}/api/voice/twiml`,
    VoiceMethod: 'POST',
  })

  const res = await fetch(twilioUrl('/IncomingPhoneNumbers.json'), {
    method:  'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const err = await res.json() as { message?: string }
    throw new Error(err.message ?? 'Failed to purchase Twilio number')
  }
  const data = await res.json() as { sid: string; phone_number: string }
  return { sid: data.sid, phoneNumber: data.phone_number }
}

/**
 * Look up an existing number on the master Twilio account by E.164 phone number.
 * Returns its SID if found (so we can update webhooks + release later), or null.
 */
export async function lookupOwnedNumber(phoneNumber: string): Promise<string | null> {
  const params = new URLSearchParams({ PhoneNumber: phoneNumber })
  const res = await fetch(twilioUrl(`/IncomingPhoneNumbers.json?${params}`), {
    headers: { Authorization: auth() },
  })
  const data = await res.json() as { incoming_phone_numbers?: Array<{ sid: string }> }
  return data.incoming_phone_numbers?.[0]?.sid ?? null
}

/**
 * Update an existing number's webhooks to point to this app (SMS + voice).
 */
export async function updateNumberWebhooks(sid: string): Promise<void> {
  const body = new URLSearchParams({
    SmsUrl:    `${APP_BASE}/api/twilio/inbound`,
    SmsMethod: 'POST',
    VoiceUrl:    `${APP_BASE}/api/voice/twiml`,
    VoiceMethod: 'POST',
  })
  await fetch(twilioUrl(`/IncomingPhoneNumbers/${sid}.json`), {
    method:  'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

/**
 * Release a Twilio phone number back to the pool.
 */
export async function releaseNumber(phoneSid: string): Promise<void> {
  const res = await fetch(twilioUrl(`/IncomingPhoneNumbers/${phoneSid}.json`), {
    method:  'DELETE',
    headers: { Authorization: auth() },
  })
  // 404 = already gone, that's fine
  if (!res.ok && res.status !== 404) {
    const err = await res.json() as { message?: string }
    throw new Error(err.message ?? 'Failed to release Twilio number')
  }
}
