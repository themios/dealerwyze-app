import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { stripe, SMS_PRICE_ID } from '@/lib/stripe'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('organizations')
    .select('plan, subscription_status, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id, sms_plan, sms_quota, monthly_message_count, monthly_mms_count, billing_cycle_end, voice_minutes_quota, monthly_voice_seconds, monthly_scan_image_count, monthly_scan_pdf_count, overage_buffer_cents')
    .eq('id', profile.org_id)
    .maybeSingle()

  let has_sms_addon = false

  if (data?.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id)
      has_sms_addon = sub.items.data.some(item => item.price.id === SMS_PRICE_ID)
    } catch {
      // subscription may not exist yet
    }
  }

  return NextResponse.json({
    ...(data ?? {
      plan: 'trial',
      subscription_status: 'trialing',
      trial_ends_at: null,
      current_period_end: null,
      stripe_customer_id: null,
    }),
    has_sms_addon,
  })
}
