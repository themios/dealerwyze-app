import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { stripe, APP_URL } from '@/lib/stripe'

const VIDEO_PACK_CREDITS = 25
const VIDEO_PACK_CENTS   = 1000 // $10.00

// POST /api/stripe/video-pack
// Creates a $10 Stripe Checkout session for 25 additional video renders.
// Reuses the org's existing Stripe customer so their saved card is pre-filled.
export async function POST() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', profile.org_id)
    .single()

  // Ensure the org has a Stripe customer — creates one if missing
  let customerId = org?.stripe_customer_id
  if (!customerId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const customer = await stripe.customers.create({
      email:    user.email,
      name:     org?.name ?? undefined,
      metadata: { org_id: profile.org_id },
    })
    customerId = customer.id
    await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', profile.org_id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode:     'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency:    'usd',
        unit_amount: VIDEO_PACK_CENTS,
        product_data: {
          name:        `${VIDEO_PACK_CREDITS} Video Renders`,
          description: 'One-time add-on. Credits apply to the current billing month.',
        },
      },
    }],
    // Allow saving the card for future purchases
    saved_payment_method_options: { payment_method_save: 'enabled' },
    metadata: {
      topup_type: 'video_pack',
      org_id:     profile.org_id,
      credits:    String(VIDEO_PACK_CREDITS),
    },
    success_url: `${APP_URL}/settings/video?video_pack=success`,
    cancel_url:  `${APP_URL}/settings/video`,
  })

  return NextResponse.json({ url: session.url })
}
