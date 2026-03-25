import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import PaymentSettingsClient from './PaymentSettingsClient'

export const dynamic = 'force-dynamic'

export default async function PaymentSettingsPage() {
  const profile  = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/settings')

  const supabase = createServiceClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('stripe_dealer_publishable_key, stripe_dealer_secret_key, booking_enabled, booking_intro_text, business_name, business_phone')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return (
    <div>
      <TopBar left={<Link href="/settings" className="flex items-center gap-1 text-white/80 hover:text-white"><ChevronLeft className="h-4 w-4" />Payments &amp; Booking</Link>} />
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Payments and Booking</h2>
          <p className="text-sm text-muted-foreground">
            Enable online BHPH payments via your Stripe account and customer self-booking.
          </p>
        </div>
        <PaymentSettingsClient
          stripePublishableKey={settings?.stripe_dealer_publishable_key ?? null}
          stripeSecretKey={settings?.stripe_dealer_secret_key ?? null}
          bookingEnabled={settings?.booking_enabled ?? false}
          bookingIntroText={settings?.booking_intro_text ?? ''}
          dealerName={settings?.business_name ?? ''}
          dealerPhone={settings?.business_phone ?? ''}
          orgSlug={profile.org_id}
        />
      </div>
    </div>
  )
}
