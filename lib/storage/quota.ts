import { STORAGE_BASE_QUOTA } from '@/lib/stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export const FREE_TIER_STORAGE_QUOTA = 50 * 1024 * 1024 // 50 MB
const FREE_TIER_ATTACHMENT_LIMIT = 2 // max 2 vehicles, 2 customers on free tier

/**
 * Returns the effective storage quota in bytes for an org.
 * Free-tier orgs: 50 MB. Paid orgs: storage_quota_bytes or 500 MB base.
 */
export async function getOrgStorageQuota(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('storage_quota_bytes, storage_pack_expires_at')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('plan')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  if (org?.plan === 'free') return FREE_TIER_STORAGE_QUOTA

  if (!settings) return STORAGE_BASE_QUOTA

  // If grace period has expired, treat as base quota regardless of stored value
  if (settings.storage_pack_expires_at && new Date(settings.storage_pack_expires_at) < new Date()) {
    return STORAGE_BASE_QUOTA
  }

  return settings.storage_quota_bytes ?? STORAGE_BASE_QUOTA
}

/**
 * Checks whether a free-tier org can upload to the given entity.
 * Returns null if allowed, or an error message string if blocked.
 *
 * Logic: if this entity already has at least one attachment, allow (doesn't consume a new slot).
 * Otherwise count distinct entities with attachments — if >= limit, block.
 */
export async function checkFreeTierAttachmentLimit(
  supabase: SupabaseClient,
  orgId: string,
  entityType: 'vehicle' | 'customer',
  entityId: string,
): Promise<string | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .maybeSingle()

  if (org?.plan !== 'free') return null

  if (entityType === 'vehicle') {
    // If this vehicle already has attachments, it doesn't consume a new slot
    const [{ count: photoCount }, { count: docCount }] = await Promise.all([
      supabase.from('vehicle_photos').select('id', { count: 'exact', head: true })
        .eq('vehicle_id', entityId).eq('org_id', orgId),
      supabase.from('vehicle_documents').select('id', { count: 'exact', head: true })
        .eq('vehicle_id', entityId).eq('user_id', orgId),
    ])
    if ((photoCount ?? 0) > 0 || (docCount ?? 0) > 0) return null

    // Count distinct vehicles with any attachments
    const [{ data: vehiclesWithPhotos }, { data: vehiclesWithDocs }] = await Promise.all([
      supabase.from('vehicle_photos').select('vehicle_id').eq('org_id', orgId),
      supabase.from('vehicle_documents').select('vehicle_id').eq('user_id', orgId),
    ])
    const distinctVehicles = new Set([
      ...(vehiclesWithPhotos ?? []).map(r => r.vehicle_id as string),
      ...(vehiclesWithDocs ?? []).map(r => r.vehicle_id as string),
    ])
    if (distinctVehicles.size >= FREE_TIER_ATTACHMENT_LIMIT) {
      return `Free accounts can add attachments to ${FREE_TIER_ATTACHMENT_LIMIT} vehicles and ${FREE_TIER_ATTACHMENT_LIMIT} customers. Upgrade to remove this limit.`
    }
  } else {
    // If this customer already has documents, it doesn't consume a new slot
    const { count: docCount } = await supabase
      .from('customer_documents')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', entityId)
      .eq('user_id', orgId)
    if ((docCount ?? 0) > 0) return null

    // Count distinct customers with any documents
    const { data: customersWithDocs } = await supabase
      .from('customer_documents')
      .select('customer_id')
      .eq('user_id', orgId)
    const distinctCustomers = new Set((customersWithDocs ?? []).map(r => r.customer_id as string))
    if (distinctCustomers.size >= FREE_TIER_ATTACHMENT_LIMIT) {
      return `Free accounts can add attachments to ${FREE_TIER_ATTACHMENT_LIMIT} vehicles and ${FREE_TIER_ATTACHMENT_LIMIT} customers. Upgrade to remove this limit.`
    }
  }

  return null
}
