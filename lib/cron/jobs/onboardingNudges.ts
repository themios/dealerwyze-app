/** Send a one-time onboarding nudge email to dealers who signed up 4+ hours ago but haven't completed setup. */

import { sendNotificationEmail } from '@/lib/email/notify'
import { buildNudgeEmailHtml, type NudgeItem } from '@/lib/email/onboarding'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runOnboardingNudges(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ onboardingNudges: number }> {
  try {
  let onboardingNudges = 0

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

  const { data: pendingOnboarding } = await supabase
    .from('org_settings')
    .select('org_id, business_phone, business_address, zip_code, timezone, voice_business_hours_start, voice_business_hours_end')
    .is('onboarding_completed_at', null)

  for (const row of pendingOnboarding ?? []) {
    const orgId = row.org_id
    if (!orgId) continue

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .not('approved_at', 'is', null)
      .lt('created_at', fourHoursAgo)
      .maybeSingle()

    if (!org) continue

    const { data: existing } = await supabase
      .from('admin_alerts')
      .select('id')
      .eq('org_id', orgId)
      .eq('alert_type', 'onboarding_nudge')
      .maybeSingle()

    if (existing) continue

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('org_id', orgId)
      .eq('role', 'dealer_admin')
      .maybeSingle()

    if (!adminProfile) continue

    const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
    const email = authUser?.user?.email
    if (!email) continue

    const [vehicleResult, gmailResult] = await Promise.all([
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('user_id', orgId),
      supabase.from('email_accounts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    ])

    const vehicleCount = vehicleResult.count ?? 0
    const gmailCount   = gmailResult.count ?? 0

    const incomplete: NudgeItem[] = []

    if (!row.business_phone) {
      incomplete.push({
        title:    'Business phone number missing',
        detail:   'Your phone number appears in texts and on your AI voice agent greeting. Customers calling in may hear a generic response without it.',
        action:   'Open the setup wizard and enter your main business phone number on the first step.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Add Phone Number',
      })
    }
    if (!row.business_address || !row.zip_code) {
      incomplete.push({
        title:    'Business address or zip code missing',
        detail:   'Your zip code is used to pull local market pricing data for your inventory. Without it, price comparisons will use national averages instead of your local market.',
        action:   'Open the setup wizard and enter your street address and zip code on the first step.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Add Address',
      })
    }
    if (!row.voice_business_hours_start || !row.voice_business_hours_end) {
      incomplete.push({
        title:    'Business hours not set',
        detail:   'Your AI voice agent uses your business hours to greet callers correctly - open hours vs. after hours messages are different.',
        action:   'Open the setup wizard, scroll to Business Hours on the first step, and set your open and close times.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Set Business Hours',
      })
    }

    if (vehicleCount === 0) {
      incomplete.push({
        title:    'No vehicles in your inventory',
        detail:   'Without inventory, DealerWyze cannot run market pricing analysis or let customers inquire about specific vehicles.',
        action:   'Go to Inventory and add your first vehicle. You only need the VIN - DealerWyze fills in year, make, and model automatically.',
        link:     `${appUrl}/vehicles/new`,
        linkText: 'Add First Vehicle',
      })
    }

    if (gmailCount === 0) {
      incomplete.push({
        title:    'Lead inbox not connected',
        detail:   'Without a connected Gmail account, leads from CarGurus, AutoTrader, Cars.com, and direct email will not appear in DealerWyze. You could be missing inquiries right now.',
        action:   'Go to Settings and connect your Gmail account. It takes about 30 seconds and you can pick any Google account.',
        link:     `${appUrl}/settings`,
        linkText: 'Connect Gmail',
      })
    }

    void sendNotificationEmail({
      to:      email,
      subject: `Action needed: ${incomplete.length} thing${incomplete.length !== 1 ? 's' : ''} left to finish your DealerWyze setup`,
      html:    buildNudgeEmailHtml(adminProfile.display_name, appUrl, incomplete),
    })

    await supabase.from('admin_alerts').insert({
      org_id:     orgId,
      alert_type: 'onboarding_nudge',
      severity:   'info',
    })

    onboardingNudges++
  }

  return { onboardingNudges }
  } catch (err) {
    console.error('[onboardingNudges] unhandled error:', err)
    throw err
  }
}
