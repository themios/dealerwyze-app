import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContactLookup {
  email?: string | null
  phone?: string | null
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Match org customers by phone (preferred) or email.
 */
export async function buildCustomerIdByContactMap(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ byPhone: Map<string, string>; byEmail: Map<string, string> }> {
  const { data: customers } = await supabase
    .from('customers')
    .select('id, email, primary_phone')
    .eq('user_id', orgId)
    .is('merged_at', null)

  const byPhone = new Map<string, string>()
  const byEmail = new Map<string, string>()

  for (const c of customers ?? []) {
    const phone = normalizePhone(c.primary_phone)
    if (phone.length >= 10) byPhone.set(phone, c.id)
    const email = c.email?.trim().toLowerCase()
    if (email) byEmail.set(email, c.id)
  }

  return { byPhone, byEmail }
}

export function resolveCustomerIdFromMaps(
  contact: ContactLookup,
  maps: { byPhone: Map<string, string>; byEmail: Map<string, string> },
): string | null {
  const phone = normalizePhone(contact.phone)
  if (phone.length >= 10) {
    const hit = maps.byPhone.get(phone)
    if (hit) return hit
  }
  const email = contact.email?.trim().toLowerCase()
  if (email) {
    const hit = maps.byEmail.get(email)
    if (hit) return hit
  }
  return null
}

export function customerImportSearchParams(contact: {
  name?: string | null
  email?: string | null
  phone?: string | null
}): string {
  const params = new URLSearchParams()
  if (contact.name?.trim()) params.set('name', contact.name.trim())
  if (contact.phone?.trim()) params.set('phone', contact.phone.trim())
  if (contact.email?.trim()) params.set('email', contact.email.trim())
  const q = params.toString()
  return q ? `?${q}` : ''
}
