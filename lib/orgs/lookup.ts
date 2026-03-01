import { createServiceClient } from '@/lib/supabase/service'

/**
 * Resolve an org_id from an inbound phone number (the Twilio/Retell "To" number).
 * Looks up org_settings.twilio_phone_number (stored with or without the leading +).
 *
 * Falls back to APOLLO_USER_ID in single-tenant / dev mode.
 * Set SAAS_MODE=true to disable the fallback (strict multi-tenant enforcement).
 */
export async function getOrgIdByPhone(toNumber: string): Promise<string | null> {
  const supabase = createServiceClient()

  // Normalize to E.164 digits only for comparison
  const digits = toNumber.replace(/\D/g, '')

  const { data: rows } = await supabase
    .from('org_settings')
    .select('org_id, twilio_phone_number')
    .not('twilio_phone_number', 'is', null)

  const match = rows?.find(r => {
    const stored = (r.twilio_phone_number as string).replace(/\D/g, '')
    return stored === digits
  })

  if (match) return match.org_id

  // Single-tenant fallback (dev / current prod setup)
  if (process.env.SAAS_MODE !== 'true') {
    return process.env.APOLLO_USER_ID ?? null
  }

  return null
}

/**
 * Get org_id for a leads source that doesn't have a phone number.
 * For Gmail-based leads (CarGurus) we rely on the Gmail address stored per org.
 *
 * Falls back to APOLLO_USER_ID in single-tenant mode.
 */
export async function getOrgIdByGmail(email: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: rows } = await supabase
    .from('org_settings')
    .select('org_id, gmail_email')
    .not('gmail_email', 'is', null)

  const match = rows?.find(r => r.gmail_email === email)
  if (match) return match.org_id

  if (process.env.SAAS_MODE !== 'true') {
    return process.env.APOLLO_USER_ID ?? null
  }

  return null
}
