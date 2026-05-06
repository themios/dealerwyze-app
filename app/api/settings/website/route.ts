/**
 * GET/PATCH /api/settings/website
 * Dealer website settings (public inventory, branding, SEO, hero, CTA, tracking).
 * Logo: `/api/settings/website/logo`. OG / favicon: dedicated routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { requestClientIp } from '@/lib/audit/requestIp'
import {
  mergeThemeColors,
  sanitizeCtaUrl,
  sanitizeEstablishedYear,
  sanitizeFontPreset,
  sanitizeGoogleSiteVerification,
  sanitizeGtmId,
  sanitizePlainText,
  sanitizeSeoDescription,
  sanitizeSeoKeywords,
  sanitizeSpecialtyTags,
  sanitizeWebsiteSocial,
} from '@/lib/dealer-public/personalization'

const ORG_SELECT = `slug, public_inventory_enabled, website_tagline, custom_domain, website_logo_url, website_contact_email,
  website_about, website_hours, website_contact_phone, website_contact_address, website_social, website_theme,
  website_font_preset, website_seo_description, website_seo_keywords,
  website_established_year, website_specialty_tags, website_service_area, website_awards,
  website_cta_label, website_cta_url, website_hero_headline, website_hero_subline,
  website_favicon_url, website_og_image_url, website_robots_noindex, website_google_site_verification, website_gtm_id`

const ALLOWED_KEYS = [
  'public_inventory_enabled',
  'website_tagline',
  'custom_domain',
  'website_contact_email',
  'website_about',
  'website_hours',
  'website_contact_phone',
  'website_contact_address',
  'website_social',
  'website_theme',
  'website_font_preset',
  'website_seo_description',
  'website_seo_keywords',
  'website_established_year',
  'website_specialty_tags',
  'website_service_area',
  'website_awards',
  'website_cta_label',
  'website_cta_url',
  'website_hero_headline',
  'website_hero_subline',
  'website_robots_noindex',
  'website_google_site_verification',
  'website_gtm_id',
] as const

function sanitizePublicEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  if (!t) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null
  return t
}

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: org } = await supabase.from('organizations').select(ORG_SELECT).eq('id', profile.org_id).single()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(org)
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      updates[key] = body[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  if (updates.public_inventory_enabled === true) {
    try {
      await assertCanUseFeature(profile.org_id, 'public_website')
    } catch (err) {
      if (err instanceof BillingError) {
        return NextResponse.json({ error: err.message }, { status: 402 })
      }
      throw err
    }
  }

  if (typeof updates.custom_domain === 'string') {
    updates.custom_domain =
      updates.custom_domain
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .trim() || null
  }

  if ('website_contact_email' in updates) {
    const raw = updates.website_contact_email
    const s = sanitizePublicEmail(raw)
    if (typeof raw === 'string' && raw.trim() && !s) {
      return NextResponse.json({ error: 'Invalid public contact email.' }, { status: 400 })
    }
    updates.website_contact_email = s
  }

  if ('website_about' in updates) {
    updates.website_about = sanitizePlainText(updates.website_about, 12_000)
  }
  if ('website_hours' in updates) {
    updates.website_hours = sanitizePlainText(updates.website_hours, 4_000)
  }
  if ('website_contact_phone' in updates) {
    updates.website_contact_phone = sanitizePlainText(updates.website_contact_phone, 40)
  }
  if ('website_contact_address' in updates) {
    updates.website_contact_address = sanitizePlainText(updates.website_contact_address, 500)
  }
  if ('website_seo_description' in updates) {
    updates.website_seo_description = sanitizeSeoDescription(updates.website_seo_description)
  }
  if ('website_seo_keywords' in updates) {
    updates.website_seo_keywords = sanitizeSeoKeywords(updates.website_seo_keywords)
  }
  if ('website_font_preset' in updates) {
    updates.website_font_preset = sanitizeFontPreset(updates.website_font_preset)
  }
  if ('website_social' in updates) {
    updates.website_social = sanitizeWebsiteSocial(updates.website_social)
  }
  if ('website_theme' in updates) {
    const t = updates.website_theme
    if (t === null) {
      updates.website_theme = null
    } else if (typeof t === 'object' && !Array.isArray(t)) {
      updates.website_theme = mergeThemeColors(t)
    } else {
      return NextResponse.json({ error: 'Invalid website theme.' }, { status: 400 })
    }
  }

  if ('website_established_year' in updates) {
    updates.website_established_year = sanitizeEstablishedYear(updates.website_established_year)
  }
  if ('website_specialty_tags' in updates) {
    updates.website_specialty_tags = sanitizeSpecialtyTags(updates.website_specialty_tags)
  }
  if ('website_service_area' in updates) {
    updates.website_service_area = sanitizePlainText(updates.website_service_area, 300)
  }
  if ('website_awards' in updates) {
    updates.website_awards = sanitizePlainText(updates.website_awards, 500)
  }
  if ('website_cta_label' in updates) {
    updates.website_cta_label = sanitizePlainText(updates.website_cta_label, 50)
  }
  if ('website_cta_url' in updates) {
    const raw = updates.website_cta_url
    const s = sanitizeCtaUrl(raw)
    if (typeof raw === 'string' && raw.trim() && !s) {
      return NextResponse.json({ error: 'Invalid CTA URL. Use https://… or a path like /apply.' }, { status: 400 })
    }
    updates.website_cta_url = s
  }
  if ('website_hero_headline' in updates) {
    updates.website_hero_headline = sanitizePlainText(updates.website_hero_headline, 80)
  }
  if ('website_hero_subline' in updates) {
    updates.website_hero_subline = sanitizePlainText(updates.website_hero_subline, 160)
  }
  if ('website_robots_noindex' in updates) {
    updates.website_robots_noindex = Boolean(updates.website_robots_noindex)
  }
  if ('website_google_site_verification' in updates) {
    const raw = updates.website_google_site_verification
    const s = sanitizeGoogleSiteVerification(raw)
    if (typeof raw === 'string' && raw.trim() && !s) {
      return NextResponse.json({ error: 'Invalid Google site verification token.' }, { status: 400 })
    }
    updates.website_google_site_verification = s
  }
  if ('website_gtm_id' in updates) {
    const raw = updates.website_gtm_id
    const s = sanitizeGtmId(raw)
    if (typeof raw === 'string' && raw.trim() && !s) {
      return NextResponse.json({ error: 'Invalid GTM ID. Expected format GTM-XXXXXXX.' }, { status: 400 })
    }
    updates.website_gtm_id = s
  }

  const supabase = await createClient()

  updates.updated_at = new Date().toISOString()

  const { error } = await supabase.from('organizations').update(updates).eq('id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  void logOrgAudit({
    org_id: profile.org_id,
    actor_id: profile.id,
    actor_type: 'user',
    action: 'website_settings_updated',
    details: { fields: Object.keys(updates) },
    ip: requestClientIp(req),
  })

  return NextResponse.json({ ok: true })
}
