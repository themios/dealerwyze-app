import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'
import PaymentSettingsClient from './PaymentSettingsClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export const dynamic = 'force-dynamic'

export default async function PaymentSettingsPage() {
  const profile  = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/settings')

  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('stripe_dealer_publishable_key, stripe_dealer_secret_key, booking_enabled, booking_intro_text, business_name, business_phone')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return (
    <SettingsPageShell
      title="Payments and Booking"
      description="Enable online BHPH payments via Stripe and configure the customer self-booking page."
      type="form"
    >
      <PaymentSettingsClient
        stripePublishableKey={settings?.stripe_dealer_publishable_key ?? null}
        stripeSecretKey={settings?.stripe_dealer_secret_key ?? null}
        bookingEnabled={settings?.booking_enabled ?? false}
        bookingIntroText={settings?.booking_intro_text ?? ''}
        dealerName={settings?.business_name ?? ''}
        dealerPhone={settings?.business_phone ?? ''}
        orgSlug={profile.org_id}
      />
    </SettingsPageShell>
  )
}
