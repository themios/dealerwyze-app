import { STORAGE_BASE_QUOTA } from '@/lib/stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the effective storage quota in bytes for an org.
 * Reads from org_settings.storage_quota_bytes (set by Stripe webhook).
 * Falls back to STORAGE_BASE_QUOTA (500 MB) if no row exists.
 */
export async function getOrgStorageQuota(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const { data } = await supabase
    .from('org_settings')
    .select('storage_quota_bytes, storage_pack_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!data) return STORAGE_BASE_QUOTA

  // If grace period has expired, treat as base quota regardless of stored value
  if (data.storage_pack_expires_at && new Date(data.storage_pack_expires_at) < new Date()) {
    return STORAGE_BASE_QUOTA
  }

  return data.storage_quota_bytes ?? STORAGE_BASE_QUOTA
}
