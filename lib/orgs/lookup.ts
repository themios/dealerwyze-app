import { createServiceClient } from '@/lib/supabase/service'

/**
 * Resolve an org_id from an inbound phone number (the Twilio/Retell "To" number).
 * Looks up org_settings.twilio_phone_number (stored with or without the leading +).
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

  return match?.org_id ?? null
}

/**
 * Get org_id for a leads source that doesn't have a phone number.
 * For Gmail-based leads (CarGurus) we rely on the Gmail address stored per org.
 */
export async function getOrgIdByGmail(email: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: rows } = await supabase
    .from('org_settings')
    .select('org_id, gmail_email')
    .not('gmail_email', 'is', null)

  const match = rows?.find(r => r.gmail_email === email)
  return match?.org_id ?? null
}

/**
 * Resolves orgId or throws. Use in webhook handlers.
 * Throws if org cannot be resolved from DB.
 */
export function requireOrgId(resolved: string | null | undefined): string {
  if (resolved) return resolved
  throw new Error('Multi-tenant: could not resolve org — check phone/email routing config')
}
