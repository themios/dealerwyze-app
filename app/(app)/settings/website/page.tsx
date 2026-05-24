import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import WebsiteSettingsClient from '@/components/settings/WebsiteSettingsClient'
import WebsiteAnalytics from '@/components/settings/WebsiteAnalytics'
import SettingsPageShell from '@/components/settings/SettingsPageShell'
import {
  mergeThemeColors,
  sanitizeFontPreset,
  sanitizeWebsiteSocial,
} from '@/lib/dealer-public/personalization'

export const dynamic = 'force-dynamic'

function formatTrialEndDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(iso))
}

export default async function WebsiteSettingsPage() {
  const hdrs = await headers()
  const isRE = hdrs.get('x-vertical') === 'real_estate'
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    redirect('/settings')
  }

  const supabase = await createClientForRequest()

  const { data: org } = await supabase
    .from('organizations')
    .select(
      `name, slug, public_inventory_enabled, website_tagline, custom_domain, plan, trial_ends_at, website_logo_url, website_contact_email,
      website_about, website_hours, website_contact_phone, website_contact_address, website_social, website_theme,
      website_font_preset, website_seo_description, website_seo_keywords,
      website_hero_headline, website_hero_subline, website_established_year, website_specialty_tags, website_service_area,
      website_awards, website_cta_label, website_cta_url, website_favicon_url, website_og_image_url,
      website_robots_noindex, website_google_site_verification, website_gtm_id`,
    )
    .eq('id', profile.org_id)
    .single()

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const businessName = orgSettings?.business_name?.trim() || org?.name || (isRE ? 'Your agency' : 'Your dealership')
  const initialSpecialtyTags = Array.isArray(org?.website_specialty_tags)
    ? (org!.website_specialty_tags as string[]).filter(Boolean)
    : []

  const inTrial = org?.trial_ends_at ? new Date(org.trial_ends_at) >= new Date() : false
  const trialEndsFormatted =
    inTrial && org?.trial_ends_at ? formatTrialEndDate(org.trial_ends_at) : null

  return (
    <SettingsPageShell
      title="Website Settings"
      description={isRE ? 'Public listings page, custom domain details, and client-facing website controls.' : 'Public inventory page, custom domain details, and customer-facing website controls.'}
      type="form"
    >
      <div className="max-w-5xl space-y-8">
        {trialEndsFormatted && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">Included in your 30-day trial</p>
            <p className="text-blue-800 dark:text-blue-200 mt-0.5">
              Your public {isRE ? 'agency website and listings are' : 'dealer website and inventory are'} part of the free demo through {trialEndsFormatted}. After
              that, the public site stays available on every plan. No upgrade required to keep it on.
            </p>
          </div>
        )}

        <WebsiteSettingsClient
          slug={org?.slug ?? ''}
          isRE={isRE}
          businessName={businessName}
          initialEnabled={org?.public_inventory_enabled ?? false}
          initialTagline={org?.website_tagline ?? ''}
          initialDomain={org?.custom_domain ?? ''}
          initialLogoUrl={org?.website_logo_url ?? ''}
          initialContactEmail={org?.website_contact_email ?? ''}
          initialAbout={org?.website_about ?? ''}
          initialHours={org?.website_hours ?? ''}
          initialPublicPhone={org?.website_contact_phone ?? ''}
          initialPublicAddress={org?.website_contact_address ?? ''}
          initialSocial={sanitizeWebsiteSocial(org?.website_social ?? {})}
          initialTheme={mergeThemeColors(org?.website_theme)}
          initialFontPreset={sanitizeFontPreset(org?.website_font_preset)}
          initialSeoDescription={org?.website_seo_description ?? ''}
          initialSeoKeywords={org?.website_seo_keywords ?? ''}
          initialHeroHeadline={org?.website_hero_headline ?? ''}
          initialHeroSubline={org?.website_hero_subline ?? ''}
          initialEstablishedYear={org?.website_established_year ?? null}
          initialSpecialtyTags={initialSpecialtyTags}
          initialServiceArea={org?.website_service_area ?? ''}
          initialAwards={org?.website_awards ?? ''}
          initialCtaLabel={org?.website_cta_label ?? ''}
          initialCtaUrl={org?.website_cta_url ?? ''}
          initialOgImageUrl={org?.website_og_image_url ?? ''}
          initialFaviconUrl={org?.website_favicon_url ?? ''}
          initialRobotsNoindex={org?.website_robots_noindex === true}
          initialGoogleSiteVerification={org?.website_google_site_verification ?? ''}
          initialGtmId={org?.website_gtm_id ?? ''}
        />

        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading analytics...</p>}>
          <WebsiteAnalytics />
        </Suspense>
      </div>
    </SettingsPageShell>
  )
}
