import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import type { Metadata } from 'next'
import Script from 'next/script'
import {
  Cormorant_Garamond,
  Dancing_Script,
  DM_Sans,
  Inter,
  Lora,
  Manrope,
  Playfair_Display,
  Poppins,
  Source_Sans_3,
} from 'next/font/google'
import DealerPublicChrome, { type DealerPublicContact } from '@/components/dealer-public/DealerPublicChrome'
import {
  absoluteUrl,
  DEALER_THEME_DEFAULT_LOGO_PATH,
  getPublicAppBaseUrl,
  jsonLdInline,
  resolvePublicCtaUrl,
} from '@/lib/dealer-public/site'
import {
  buildPublicMetaDescription,
  mergeThemeColors,
  metaKeywordsList,
  parseHoursToSchema,
  plainTextSnippet,
  sanitizeWebsiteSocial,
  sameAsUrls,
  themeToInlineStyle,
} from '@/lib/dealer-public/personalization'
import {
  loadOrganizationsMatchingPublicSlug,
  pickUniqueOrgSlugMatch,
} from '@/lib/dealer-public/publicOrgBySlug'

export const dynamic = 'force-dynamic'

const fontCormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-cormorant',
})
const fontPoppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
})
const fontDancing = Dancing_Script({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-dancing',
})
const fontLora = Lora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-lora',
})
const fontSourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-source-sans-3',
})
const fontDmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
})
const fontManrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
})
const fontPlayfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-playfair',
})
const fontInter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})

const fontRootClassName = [
  fontCormorant.variable,
  fontPoppins.variable,
  fontDancing.variable,
  fontLora.variable,
  fontSourceSans.variable,
  fontDmSans.variable,
  fontManrope.variable,
  fontPlayfair.variable,
  fontInter.variable,
].join(' ')

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

function normalizeSlugParam(s: string) {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  return `https://${t}`
}

/** Row shape for public dealer layout (explicit so builds succeed if Supabase types lag migrations). */
interface DealerPublicOrgRow {
  id: string
  name: string
  website_tagline: string | null
  slug: string
  website_logo_url: string | null
  website_contact_email: string | null
  website_about: string | null
  website_hours: string | null
  website_contact_phone: string | null
  website_contact_address: string | null
  website_social: unknown
  website_theme: unknown
  website_font_preset: string | null
  website_seo_description: string | null
  website_seo_keywords: string | null
  website_established_year: number | null
  website_specialty_tags: unknown
  website_service_area: string | null
  website_awards: string | null
  website_cta_label: string | null
  website_cta_url: string | null
  website_favicon_url: string | null
  website_og_image_url: string | null
  website_robots_noindex: boolean | null
  website_google_site_verification: string | null
  website_gtm_id: string | null
  public_inventory_enabled: boolean | null
}

const ORG_PUBLIC_SELECT = [
  'id',
  'name',
  'website_tagline',
  'slug',
  'website_logo_url',
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
  'website_favicon_url',
  'website_og_image_url',
  'website_robots_noindex',
  'website_google_site_verification',
  'website_gtm_id',
  'public_inventory_enabled',
].join(', ')

function dealerRobots(noindex: boolean | null | undefined): Metadata['robots'] {
  if (noindex) return { index: false, follow: false }
  return { index: true, follow: true }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error: metaOrgErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    ORG_PUBLIC_SELECT,
    { onlyPublicInventory: true },
  )
  if (metaOrgErr) return {}
  const { row: org, ambiguous: metaAmbiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as DealerPublicOrgRow[],
    slugNorm,
  )
  if (!org || metaAmbiguous) return {}

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', org.id)
    .maybeSingle()

  const displayName = settings?.business_name?.trim() || org.name
  const description = buildPublicMetaDescription({
    seoDescription: org.website_seo_description,
    tagline: org.website_tagline,
    about: org.website_about,
    displayName,
  })
  const canonicalPath = `/${org.slug}/inventory`
  const canonical = absoluteUrl(canonicalPath)
  const logoAbs = org.website_logo_url?.trim()
    ? org.website_logo_url.trim()
    : absoluteUrl(DEALER_THEME_DEFAULT_LOGO_PATH)
  const ogUrl = org.website_og_image_url?.trim() || logoAbs
  const ogDims = org.website_og_image_url?.trim()
    ? { width: 1200, height: 630 }
    : { width: 512, height: 512 }

  const titleDefault = `${displayName} — Used vehicles for sale`
  const keywords = metaKeywordsList(org.website_seo_keywords ?? undefined)
  const verify = org.website_google_site_verification?.trim()

  return {
    metadataBase: new URL(getPublicAppBaseUrl()),
    title: titleDefault,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical },
    robots: dealerRobots(org.website_robots_noindex),
    ...(verify ? { verification: { google: verify } } : {}),
    icons: org.website_favicon_url?.trim()
      ? {
          icon: org.website_favicon_url.trim(),
          apple: org.website_favicon_url.trim(),
        }
      : undefined,
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: displayName,
      url: canonical,
      title: titleDefault,
      description,
      images: [{ url: ogUrl, width: ogDims.width, height: ogDims.height, alt: displayName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titleDefault,
      description,
      images: [ogUrl],
    },
  }
}

export default async function DealerPublicLayout({ children, params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error: orgErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    ORG_PUBLIC_SELECT,
    { onlyPublicInventory: false },
  )
  const { row: org, ambiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as DealerPublicOrgRow[],
    slugNorm,
  )
  if (orgErr || ambiguous || !org || org.public_inventory_enabled !== true) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[dealer-public] notFound', {
        slugRequested: slugNorm,
        supabaseError: orgErr?.message ?? null,
        supabaseCode: orgErr?.code ?? null,
        orgFound: Boolean(org),
        ambiguous,
        matchCount: rows.length,
        orgId: org?.id ?? null,
        public_inventory_enabled: org?.public_inventory_enabled ?? null,
        hint:
          'Use the exact organizations.slug (see Settings → Website link). "apollo-auto" in /dealer-themes/ is only the default theme folder, not your slug. If matchCount > 1, two orgs may share the same slug with different casing — fix duplicates in the database.',
      })
    }
    notFound()
  }

  const { data: settings } = await supabase
    .from('org_settings')
    .select(
      'business_name, business_phone, business_address, zip_code, twilio_phone_number, dealer_website_url',
    )
    .eq('org_id', org.id)
    .maybeSingle()

  const displayName = settings?.business_name?.trim() || org.name
  const businessPhone = settings?.business_phone?.trim() || null
  const twilioPhone = settings?.twilio_phone_number?.trim() || null
  const publicPhoneOverride = org.website_contact_phone?.trim() || null
  const phone = publicPhoneOverride || businessPhone || twilioPhone || null
  const secondaryPhone = [businessPhone, twilioPhone].find(p => p && p !== phone) ?? null
  const address = org.website_contact_address?.trim() || settings?.business_address?.trim() || null
  const zipCode = org.website_contact_address?.trim() ? null : settings?.zip_code?.trim() || null
  const email = org.website_contact_email?.trim() || null
  const externalWebsite = normalizeWebsiteUrl(settings?.dealer_website_url)
  const social = sanitizeWebsiteSocial(org.website_social)
  const hours = org.website_hours?.trim() || null
  const aboutText = org.website_about?.trim() || null
  const specialtyTags = Array.isArray(org.website_specialty_tags)
    ? (org.website_specialty_tags as string[]).filter(Boolean)
    : []
  const serviceArea = org.website_service_area?.trim() || null
  const establishedYear = org.website_established_year ?? null
  const awards = org.website_awards?.trim() || null
  const ctaLabel = org.website_cta_label?.trim() || null
  const ctaHref = resolvePublicCtaUrl(org.website_cta_url?.trim() ?? null)
  const gtmId = org.website_gtm_id?.trim() || null

  const contact: DealerPublicContact = {
    displayName,
    tagline: org.website_tagline?.trim() || null,
    slug: org.slug as string,
    logoSrc: org.website_logo_url?.trim() || null,
    address,
    zipCode,
    phone,
    secondaryPhone,
    email,
    externalWebsite,
    hours,
    social,
    showAboutInNav: Boolean(aboutText),
    specialtyTags,
    serviceArea,
    establishedYear,
    awards,
    ctaLabel,
    ctaHref,
  }

  const themeColors = mergeThemeColors(org.website_theme)
  const rootStyle = themeToInlineStyle(themeColors, org.website_font_preset)

  const siteRootUrl = absoluteUrl(`/${org.slug}`)
  const inventoryUrl = absoluteUrl(`/${org.slug}/inventory`)
  const logoForSchema = contact.logoSrc || absoluteUrl(DEALER_THEME_DEFAULT_LOGO_PATH)
  const tel = phone || secondaryPhone
  const digits = tel ? tel.replace(/\D/g, '') : ''
  const telephoneE164 = digits.length === 10 ? `+1${digits}` : digits ? `+${digits}` : undefined

  const dealerId = `${getPublicAppBaseUrl()}/#dealer-${org.slug}`
  const orgDescription =
    plainTextSnippet(org.website_about, 600) ??
    buildPublicMetaDescription({
      seoDescription: org.website_seo_description,
      tagline: org.website_tagline,
      about: org.website_about,
      displayName,
    })

  const sameAs = sameAsUrls(social, externalWebsite)
  const openingHours = parseHoursToSchema(org.website_hours ?? undefined)
  const founding = org.website_established_year ? String(org.website_established_year) : undefined
  const knowsAbout = specialtyTags.length ? specialtyTags : undefined
  const award = org.website_awards?.trim() || undefined
  const areaServed = serviceArea || undefined

  const autoDealerNode: Record<string, unknown> = {
    '@type': 'AutoDealer',
    '@id': dealerId,
    name: displayName,
    description: orgDescription,
    url: inventoryUrl,
    image: logoForSchema,
    ...(telephoneE164 ? { telephone: telephoneE164 } : {}),
    ...(email ? { email } : {}),
    ...(address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: address,
            ...(zipCode ? { postalCode: zipCode } : {}),
            addressCountry: 'US',
          },
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(founding ? { foundingDate: founding } : {}),
    ...(org.website_tagline?.trim() ? { slogan: org.website_tagline.trim() } : {}),
    ...(knowsAbout ? { knowsAbout } : {}),
    ...(award ? { award } : {}),
    ...(areaServed ? { areaServed } : {}),
    ...(openingHours ? { openingHours } : {}),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Used Vehicles at ${displayName}`,
      url: inventoryUrl,
    },
  }

  const breadcrumbId = `${inventoryUrl}#breadcrumb`
  const breadcrumbList = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: displayName,
        item: siteRootUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Inventory',
        item: inventoryUrl,
      },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      autoDealerNode,
      {
        '@type': 'WebSite',
        name: `${displayName} — Inventory`,
        url: inventoryUrl,
        description: buildPublicMetaDescription({
          seoDescription: org.website_seo_description,
          tagline: org.website_tagline,
          about: org.website_about,
          displayName,
        }),
        publisher: { '@id': dealerId },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${inventoryUrl}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      breadcrumbList,
    ],
  }

  return (
    <>
      {gtmId ? (
        <>
          <Script id="gtm-loader" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          <noscript>
            <iframe
              title="Google Tag Manager"
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        </>
      ) : null}
      <div className={fontRootClassName} style={rootStyle}>
        <DealerPublicChrome contact={contact}>{children}</DealerPublicChrome>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdInline(jsonLd) }}
          suppressHydrationWarning
        />
      </div>
    </>
  )
}
