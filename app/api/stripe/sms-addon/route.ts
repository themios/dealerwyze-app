import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBilling } from '@/lib/auth/dealerRoles'
import { stripe, SMS_PRICE_ID } from '@/lib/stripe'
import type { UserRole } from '@/types'

// POST: add SMS add-on to existing subscription
// DELETE: remove SMS add-on
export async function POST() {
  const profile = await requireProfile()
  if (!canAccessBilling(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  // Check if already has SMS add-on
  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const hasAddon = sub.items.data.some(item => item.price.id === SMS_PRICE_ID)
  if (hasAddon) {
    return NextResponse.json({ error: 'SMS add-on already active' }, { status: 400 })
  }

  await stripe.subscriptionItems.create({
    subscription: org.stripe_subscription_id,
    price: SMS_PRICE_ID,
    quantity: 1,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const profile = await requireProfile()
  if (!canAccessBilling(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const addonItem = sub.items.data.find(item => item.price.id === SMS_PRICE_ID)

  if (!addonItem) {
    return NextResponse.json({ error: 'SMS add-on not active' }, { status: 400 })
  }

  await stripe.subscriptionItems.del(addonItem.id)

  return NextResponse.json({ success: true })
}
