import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { stripe, APP_URL } from '@/lib/stripe'

export async function POST() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', profile.org_id)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${APP_URL}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
