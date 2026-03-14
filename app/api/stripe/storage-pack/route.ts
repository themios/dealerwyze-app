import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import {
  stripe,
  storagePackFromPriceId,
  priceIdForStoragePack,
  STORAGE_PACK_QUOTA,
  STORAGE_BASE_QUOTA,
  type StoragePack,
} from '@/lib/stripe'

// POST /api/stripe/storage-pack  body: { pack: '10gb' | '25gb' }
// Adds a storage pack to the org's existing Stripe subscription
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { pack } = await req.json() as { pack?: StoragePack }
  if (pack !== '10gb' && pack !== '25gb') {
    return NextResponse.json({ error: 'Invalid pack. Choose 10gb or 25gb.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found. Please set up a billing plan before adding storage.' }, { status: 400 })
  }

  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)

  // Check if already has a storage pack
  for (const item of sub.items.data) {
    if (storagePackFromPriceId(item.price.id)) {
      return NextResponse.json({ error: 'You already have a storage pack active. Contact support to change tiers.' }, { status: 400 })
    }
  }

  const priceId = priceIdForStoragePack(pack)
  if (!priceId) {
    return NextResponse.json({ error: 'Storage upgrade is not available right now. Please try again or contact support.' }, { status: 500 })
  }

  await stripe.subscriptionItems.create({
    subscription: org.stripe_subscription_id,
    price: priceId,
    quantity: 1,
  })

  // Immediately update org_settings quota (webhook will also fire, but this is faster UX)
  await supabase
    .from('org_settings')
    .update({
      storage_pack: pack,
      storage_quota_bytes: STORAGE_PACK_QUOTA[pack],
      storage_pack_stripe_sub_id: org.stripe_subscription_id,
      storage_pack_expires_at: null,
    })
    .eq('org_id', profile.org_id)

  return NextResponse.json({ success: true, pack, quota_bytes: STORAGE_PACK_QUOTA[pack] })
}

// DELETE /api/stripe/storage-pack
// Removes the storage pack from the subscription; quota reverts after 90-day grace
export async function DELETE() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 })
  }

  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const packItem = sub.items.data.find(item => storagePackFromPriceId(item.price.id))

  if (!packItem) {
    return NextResponse.json({ error: 'No storage pack is currently active on this account.' }, { status: 400 })
  }

  await stripe.subscriptionItems.del(packItem.id)

  // Set 90-day grace period — quota stays until then, cron deletes excess after
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('org_settings')
    .update({
      storage_pack: 'none',
      storage_pack_expires_at: expiresAt,
      // quota_bytes stays at current level until grace period ends (cron resets it)
    })
    .eq('org_id', profile.org_id)

  return NextResponse.json({ success: true, expires_at: expiresAt, base_quota_bytes: STORAGE_BASE_QUOTA })
}
