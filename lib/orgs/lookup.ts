import { createServiceClient } from '@/lib/supabase/service'

/**
 * Resolve an org_id from an inbound phone number (the Twilio/Retell "To" number).
 * Looks up org_settings.twilio_phone_number (stored with or without the leading +).
 * Query is bounded via .in() on known string variants + .limit(1).
 */
export async function getOrgIdByPhone(toNumber: string): Promise<string | null> {
  const supabase = createServiceClient()

  const digits = toNumber.replace(/\D/g, '')
  const variants = new Set<string>()
  const trimmed = toNumber.trim()
  if (trimmed) variants.add(trimmed)
  if (digits.length === 10) {
    variants.add(digits)
    variants.add(`+1${digits}`)
    variants.add(`1${digits}`)
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`)
    variants.add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`)
  } else if (digits.length === 11 && digits.startsWith('1')) {
    variants.add(digits)
    variants.add(`+${digits}`)
    variants.add(digits.slice(1))
  } else if (digits.length > 0) {
    variants.add(digits)
    variants.add(`+${digits}`)
  }

  const uniq = [...variants].filter(Boolean)
  if (uniq.length === 0) return null

  const { data: row } = await supabase
    .from('org_settings')
    .select('org_id, twilio_phone_number')
    .in('twilio_phone_number', uniq)
    .limit(1)
    .maybeSingle()

  if (!row?.twilio_phone_number) return null
  const stored = (row.twilio_phone_number as string).replace(/\D/g, '')
  if (stored !== digits) return null
  return row.org_id ?? null
}

/**
 * Get org_id for a leads source that doesn't have a phone number.
 * For Gmail-based leads (CarGurus) we rely on the Gmail address stored per org.
 */
export async function getOrgIdByGmail(email: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('org_settings')
    .select('org_id')
    .eq('gmail_email', email)
    .limit(1)
    .maybeSingle()

  return row?.org_id ?? null
}

/**
 * Resolves orgId or throws. Use in webhook handlers.
 * Throws if org cannot be resolved from DB.
 */
export function requireOrgId(resolved: string | null | undefined): string {
  if (resolved) return resolved
  throw new Error('Multi-tenant: could not resolve org — check phone/email routing config')
}
