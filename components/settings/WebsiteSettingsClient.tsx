'use client'

import { useRef, useState } from 'react'
import { Globe, Copy, Check, ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { cn } from '@/lib/utils'
import WebsitePreviewPanel from '@/components/settings/WebsitePreviewPanel'
import { getPublicAppBaseUrl } from '@/lib/dealer-public/site'
import {
  DEFAULT_THEME,
  FONT_PRESET_OPTIONS,
  type FontPresetId,
  type ThemeColors,
  type WebsiteSocial,
} from '@/lib/dealer-public/personalization'

const textareaClassName = cn(
  'min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
)

const THEME_LABELS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'navy', label: 'Primary navy' },
  { key: 'navyDeep', label: 'Navy deep' },
  { key: 'navyLight', label: 'Navy light' },
  { key: 'gold', label: 'Gold accent' },
  { key: 'goldLight', label: 'Gold light' },
  { key: 'cream', label: 'Page background' },
  { key: 'warmWhite', label: 'Card / footer' },
  { key: 'white', label: 'White' },
  { key: 'ink', label: 'Body text' },
]

const FONT_LABELS: Record<FontPresetId, string> = {
  apollo: 'Apollo — elegant script + serif (default)',
  heritage: 'Heritage — classic serif + sans',
  metro: 'Metro — modern geometric sans',
  showroom: 'Showroom — high-contrast display',
  minimal: 'Minimal — single clean sans',
}

interface Props {
  slug: string
  businessName: string
  initialEnabled: boolean
  initialTagline: string
  initialDomain: string
  /** Public URL after upload (empty = default theme logo on site). */
  initialLogoUrl: string
  /** Shown in the public site footer; optional. */
  initialContactEmail: string
  initialAbout: string
  initialHours: string
  initialPublicPhone: string
  initialPublicAddress: string
  initialSocial: WebsiteSocial
  initialTheme: ThemeColors
  initialFontPreset: FontPresetId
  initialSeoDescription: string
  initialSeoKeywords: string
  initialHeroHeadline: string
  initialHeroSubline: string
  initialEstablishedYear: number | null
  initialSpecialtyTags: string[]
  initialServiceArea: string
  initialAwards: string
  initialCtaLabel: string
  initialCtaUrl: string
  initialOgImageUrl: string
  initialFaviconUrl: string
  initialRobotsNoindex: boolean
  initialGoogleSiteVerification: string
  initialGtmId: string
}

export default function WebsiteSettingsClient({
  slug,
  businessName,
  initialEnabled,
  initialTagline,
  initialDomain,
  initialLogoUrl,
  initialContactEmail,
  initialAbout,
  initialHours,
  initialPublicPhone,
  initialPublicAddress,
  initialSocial,
  initialTheme,
  initialFontPreset,
  initialSeoDescription,
  initialSeoKeywords,
  initialHeroHeadline,
  initialHeroSubline,
  initialEstablishedYear,
  initialSpecialtyTags,
  initialServiceArea,
  initialAwards,
  initialCtaLabel,
  initialCtaUrl,
  initialOgImageUrl,
  initialFaviconUrl,
  initialRobotsNoindex,
  initialGoogleSiteVerification,
  initialGtmId,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [tagline, setTagline] = useState(initialTagline)
  const [domain, setDomain] = useState(initialDomain)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [contactEmail, setContactEmail] = useState(initialContactEmail)
  const [about, setAbout] = useState(initialAbout)
  const [hours, setHours] = useState(initialHours)
  const [publicPhone, setPublicPhone] = useState(initialPublicPhone)
  const [publicAddress, setPublicAddress] = useState(initialPublicAddress)
  const [social, setSocial] = useState<WebsiteSocial>({ ...initialSocial })
  const [theme, setTheme] = useState<ThemeColors>({ ...initialTheme })
  const [fontPreset, setFontPreset] = useState<FontPresetId>(initialFontPreset)
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription)
  const [seoKeywords, setSeoKeywords] = useState(initialSeoKeywords)
  const [heroHeadline, setHeroHeadline] = useState(initialHeroHeadline)
  const [heroSubline, setHeroSubline] = useState(initialHeroSubline)
  const [establishedYear, setEstablishedYear] = useState(
    initialEstablishedYear != null ? String(initialEstablishedYear) : '',
  )
  const [specialtyTagsInput, setSpecialtyTagsInput] = useState(initialSpecialtyTags.join(', '))
  const [serviceArea, setServiceArea] = useState(initialServiceArea)
  const [awards, setAwards] = useState(initialAwards)
  const [ctaLabel, setCtaLabel] = useState(initialCtaLabel)
  const [ctaUrl, setCtaUrl] = useState(initialCtaUrl)
  const [ogImageUrl, setOgImageUrl] = useState(initialOgImageUrl)
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl)
  const [robotsNoindex, setRobotsNoindex] = useState(initialRobotsNoindex)
  const [googleSiteVerification, setGoogleSiteVerification] = useState(initialGoogleSiteVerification)
  const [gtmId, setGtmId] = useState(initialGtmId)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [ogUploading, setOgUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logoFileRef = useRef<HTMLInputElement>(null)
  const ogFileRef = useRef<HTMLInputElement>(null)
  const faviconFileRef = useRef<HTMLInputElement>(null)

  const publicUrl = `${getPublicAppBaseUrl()}/${slug}/inventory`
  const isDirty =
    enabled !== initialEnabled ||
    tagline !== initialTagline ||
    domain !== initialDomain ||
    contactEmail !== initialContactEmail ||
    about !== initialAbout ||
    hours !== initialHours ||
    publicPhone !== initialPublicPhone ||
    publicAddress !== initialPublicAddress ||
    JSON.stringify(social) !== JSON.stringify(initialSocial) ||
    JSON.stringify(theme) !== JSON.stringify(initialTheme) ||
    fontPreset !== initialFontPreset ||
    seoDescription !== initialSeoDescription ||
    seoKeywords !== initialSeoKeywords ||
    heroHeadline !== initialHeroHeadline ||
    heroSubline !== initialHeroSubline ||
    establishedYear !== (initialEstablishedYear != null ? String(initialEstablishedYear) : '') ||
    specialtyTagsInput !== initialSpecialtyTags.join(', ') ||
    serviceArea !== initialServiceArea ||
    awards !== initialAwards ||
    ctaLabel !== initialCtaLabel ||
    ctaUrl !== initialCtaUrl ||
    ogImageUrl !== initialOgImageUrl ||
    faviconUrl !== initialFaviconUrl ||
    robotsNoindex !== initialRobotsNoindex ||
    googleSiteVerification !== initialGoogleSiteVerification ||
    gtmId !== initialGtmId

  useUnsavedChangesGuard(isDirty)

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/settings/website', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_inventory_enabled: enabled,
          website_tagline: tagline,
          custom_domain: domain || null,
          website_contact_email: contactEmail.trim() || null,
          website_about: about.trim() || null,
          website_hours: hours.trim() || null,
          website_contact_phone: publicPhone.trim() || null,
          website_contact_address: publicAddress.trim() || null,
          website_social: social,
          website_theme: theme,
          website_font_preset: fontPreset,
          website_seo_description: seoDescription.trim() || null,
          website_seo_keywords: seoKeywords.trim() || null,
          website_hero_headline: heroHeadline.trim() || null,
          website_hero_subline: heroSubline.trim() || null,
          website_established_year: (() => {
            const t = establishedYear.trim()
            if (!t) return null
            const n = parseInt(t, 10)
            return Number.isFinite(n) ? n : null
          })(),
          website_specialty_tags: specialtyTagsInput
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          website_service_area: serviceArea.trim() || null,
          website_awards: awards.trim() || null,
          website_cta_label: ctaLabel.trim() || null,
          website_cta_url: ctaUrl.trim() || null,
          website_robots_noindex: robotsNoindex,
          website_google_site_verification: googleSiteVerification.trim() || null,
          website_gtm_id: gtmId.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(
          (data as { error?: string }).error ??
            (res.status === 402
              ? 'Upgrade required to enable the public website.'
              : 'Could not save website settings.'),
        )
        return
      }
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  const copyUrl = async () => {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setLogoUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/website/logo', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { error?: string; website_logo_url?: string }
      if (!res.ok) {
        setError(data.error ?? 'Logo upload failed.')
        return
      }
      if (data.website_logo_url) {
        setLogoUrl(data.website_logo_url)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = async () => {
    setLogoUploading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/website/logo', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not remove logo.')
        return
      }
      setLogoUrl('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setLogoUploading(false)
    }
  }

  const onOgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setOgUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/website/og-image', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { error?: string; website_og_image_url?: string }
      if (!res.ok) {
        setError(data.error ?? 'OG image upload failed.')
        return
      }
      if (data.website_og_image_url) {
        setOgImageUrl(data.website_og_image_url)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setOgUploading(false)
    }
  }

  const removeOg = async () => {
    setOgUploading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/website/og-image', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not remove OG image.')
        return
      }
      setOgImageUrl('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setOgUploading(false)
    }
  }

  const onFaviconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setFaviconUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/website/favicon', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { error?: string; website_favicon_url?: string }
      if (!res.ok) {
        setError(data.error ?? 'Favicon upload failed.')
        return
      }
      if (data.website_favicon_url) {
        setFaviconUrl(data.website_favicon_url)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setFaviconUploading(false)
    }
  }

  const removeFavicon = async () => {
    setFaviconUploading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/website/favicon', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not remove favicon.')
        return
      }
      setFaviconUrl('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setFaviconUploading(false)
    }
  }

  const setThemeColor = (key: keyof ThemeColors, hex: string) => {
    setTheme(prev => ({ ...prev, [key]: hex }))
  }

  const previewTags = specialtyTagsInput
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:gap-10 lg:items-start">
      <div className="space-y-10 min-w-0">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Public inventory page</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Let customers browse and contact you from a public website.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(e => !e)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
              enabled ? 'bg-blue-600' : 'bg-gray-300'
            }`}
            aria-label={enabled ? 'Disable public inventory' : 'Enable public inventory'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="space-y-1.5 rounded-md bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline truncate flex-1"
              >
                {publicUrl}
              </a>
              <button onClick={copyUrl} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy link">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Uses your organization <span className="font-medium text-foreground">slug</span> in the path — not the{' '}
              <code className="rounded bg-background px-1 py-0.5 text-[10px]">dealer-themes/apollo-auto</code> folder (that is
              only the default theme assets).
            </p>
          </div>
        )}
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Brand &amp; story</h3>
        <div className="space-y-1.5">
          <Label htmlFor="tagline">Dealer tagline</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={e => setTagline(e.target.value)}
            placeholder="e.g. Quality used cars in El Monte"
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            Shown in the header and in search snippets — keep it specific and local for SEO.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="about">About us / story</Label>
          <textarea
            id="about"
            className={textareaClassName}
            value={about}
            onChange={e => setAbout(e.target.value)}
            placeholder="Tell shoppers who you are, how long you’ve been in business, what makes your inventory different. Use blank lines between paragraphs."
            maxLength={12000}
          />
          <p className="text-xs text-muted-foreground">
            Appears on your inventory page (with a dedicated #about section) and enriches structured data for Google and
            AI answers.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hours">Business hours</Label>
          <textarea
            id="hours"
            className={textareaClassName}
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder={'Mon–Fri 9–7\nSat 10–6\nSun closed'}
            maxLength={4000}
          />
          <p className="text-xs text-muted-foreground">Shown in the public site footer.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Public logo &amp; contact</h3>

        <div className="space-y-2">
          <Label>Public site logo</Label>
          <p className="text-xs text-muted-foreground">
            Upload a JPEG, PNG, or WebP (max 2&nbsp;MB). If you remove it, the default theme logo is used.
          </p>
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start">
            <div className="flex h-20 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Supabase public URL
                <img src={logoUrl} alt="Logo preview" className="max-h-[72px] max-w-full object-contain px-2" />
              ) : (
                <span className="px-3 text-center text-xs text-muted-foreground">Default theme logo</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={onLogoFile}
                  disabled={logoUploading}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => logoFileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {logoUploading ? 'Working…' : 'Upload logo'}
                </Button>
                {logoUrl ? (
                  <Button type="button" variant="outline" size="sm" onClick={removeLogo} disabled={logoUploading}>
                    Remove logo
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pub-email">Public contact email</Label>
          <Input
            id="pub-email"
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="sales@yourdealership.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pub-phone">Public phone override</Label>
          <Input
            id="pub-phone"
            value={publicPhone}
            onChange={e => setPublicPhone(e.target.value)}
            placeholder="Optional — else Organization business phone"
            maxLength={40}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pub-address">Public address override</Label>
          <textarea
            id="pub-address"
            className={cn(textareaClassName, 'min-h-[72px]')}
            value={publicAddress}
            onChange={e => setPublicAddress(e.target.value)}
            placeholder="Optional — full address as it should appear on the public site"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            If set, replaces the organization street address on the public site (ZIP from Organization is not appended).
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Social profiles</h3>
        <p className="text-xs text-muted-foreground">
          Added to footer links and <code className="text-[11px]">sameAs</code> in structured data for brand SEO.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['facebook', 'Facebook URL'],
              ['instagram', 'Instagram URL'],
              ['youtube', 'YouTube URL'],
              ['tiktok', 'TikTok URL'],
              ['x', 'X (Twitter) URL'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`soc-${key}`}>{label}</Label>
              <Input
                id={`soc-${key}`}
                value={social[key] ?? ''}
                onChange={e =>
                  setSocial(prev => ({
                    ...prev,
                    [key]: e.target.value.trim() || undefined,
                  }))
                }
                placeholder="https://…"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Colors</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setTheme({ ...DEFAULT_THEME })}>
            Reset to default palette
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">6-digit hex values. Applied as CSS variables on your public site.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {THEME_LABELS.map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label={label}
                  className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                  value={theme[key]}
                  onChange={e => setThemeColor(key, e.target.value)}
                />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{theme[key]}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Typography</h3>
        <Label htmlFor="font-preset">Font preset</Label>
        <Select value={fontPreset} onValueChange={v => setFontPreset(v as FontPresetId)}>
          <SelectTrigger id="font-preset" className="w-full max-w-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_PRESET_OPTIONS.map(id => (
              <SelectItem key={id} value={id}>
                {FONT_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Inventory hero</h3>
        <p className="text-xs text-muted-foreground">
          Overrides the default script line and headline on your public inventory page. Leave blank to use tagline /
          defaults.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="hero-headline">Hero headline (H1)</Label>
          <Input
            id="hero-headline"
            value={heroHeadline}
            onChange={e => setHeroHeadline(e.target.value)}
            placeholder="e.g. Browse our inventory"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hero-subline">Hero script line</Label>
          <Input
            id="hero-subline"
            value={heroSubline}
            onChange={e => setHeroSubline(e.target.value)}
            placeholder="e.g. Family-owned quality since 1999"
            maxLength={160}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Trust &amp; local signals</h3>
        <div className="space-y-1.5">
          <Label htmlFor="est-year">Year established</Label>
          <Input
            id="est-year"
            inputMode="numeric"
            value={establishedYear}
            onChange={e => setEstablishedYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="e.g. 1995"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specialty-tags">Specialties (comma-separated)</Label>
          <Input
            id="specialty-tags"
            value={specialtyTagsInput}
            onChange={e => setSpecialtyTagsInput(e.target.value)}
            placeholder="BHPH, trucks, imports…"
          />
          <p className="text-xs text-muted-foreground">Up to eight short tags; shown as chips on the inventory hero.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service-area">Service area</Label>
          <Input
            id="service-area"
            value={serviceArea}
            onChange={e => setServiceArea(e.target.value)}
            placeholder="e.g. Serving El Monte and the San Gabriel Valley"
            maxLength={300}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="awards">Awards / credentials</Label>
          <textarea
            id="awards"
            className={textareaClassName}
            value={awards}
            onChange={e => setAwards(e.target.value)}
            placeholder="Optional — one line in the footer"
            maxLength={500}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Header call-to-action</h3>
        <p className="text-xs text-muted-foreground">
          Optional primary button in the public header. Use a full URL (https://…) or a path like{' '}
          <code className="text-[11px]">/apply</code>. Phone button still appears when a number is available.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="cta-label">Button label</Label>
          <Input
            id="cta-label"
            value={ctaLabel}
            onChange={e => setCtaLabel(e.target.value)}
            placeholder="e.g. Get pre-approved"
            maxLength={50}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cta-url">Button URL</Label>
          <Input
            id="cta-url"
            value={ctaUrl}
            onChange={e => setCtaUrl(e.target.value)}
            placeholder="https://… or /financing"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Social sharing images</h3>
        <p className="text-xs text-muted-foreground">
          Open Graph image (max 3&nbsp;MB) and favicon (max 512&nbsp;KB). If unset, we fall back to your logo for OG and
          the browser default icon.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-4">
            <Label>Open Graph image</Label>
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
              {ogImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ogImageUrl} alt="OG preview" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-xs text-muted-foreground">Uses logo if empty</span>
              )}
            </div>
            <input
              ref={ogFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={onOgFile}
              disabled={ogUploading}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={ogUploading} onClick={() => ogFileRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {ogUploading ? 'Working…' : 'Upload OG'}
              </Button>
              {ogImageUrl ? (
                <Button type="button" variant="outline" size="sm" onClick={removeOg} disabled={ogUploading}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <Label>Favicon</Label>
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
              {faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faviconUrl} alt="Favicon preview" className="max-h-14 max-w-14 object-contain" />
              ) : (
                <span className="px-2 text-center text-xs text-muted-foreground">Browser default</span>
              )}
            </div>
            <input
              ref={faviconFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={onFaviconFile}
              disabled={faviconUploading}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={faviconUploading}
                onClick={() => faviconFileRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {faviconUploading ? 'Working…' : 'Upload favicon'}
              </Button>
              {faviconUrl ? (
                <Button type="button" variant="outline" size="sm" onClick={removeFavicon} disabled={faviconUploading}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">SEO &amp; AI discovery</h3>
        <div className="space-y-1.5">
          <Label htmlFor="seo-desc">Meta description override</Label>
          <Input
            id="seo-desc"
            value={seoDescription}
            onChange={e => setSeoDescription(e.target.value)}
            placeholder="Optional — max ~320 characters"
            maxLength={320}
          />
          <p className="text-xs text-muted-foreground">
            If empty, we build a description from your tagline and About text (better for long-tail and AI snippets).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seo-kw">Focus keywords</Label>
          <Input
            id="seo-kw"
            value={seoKeywords}
            onChange={e => setSeoKeywords(e.target.value)}
            placeholder="e.g. used cars, BHPH, El Monte, Toyota"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">Comma-separated. Used for meta keywords and extra topical signals.</p>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 p-4">
        <h3 className="text-sm font-semibold">Advanced</h3>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
            checked={robotsNoindex}
            onChange={e => setRobotsNoindex(e.target.checked)}
          />
          <span>
            <span className="text-sm font-medium">Hide public site from search engines</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Sets noindex on dealer pages and removes this dealer from the DealerWyze sitemap index.
            </span>
          </span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="gverify">Google Search Console verification token</Label>
          <Input
            id="gverify"
            value={googleSiteVerification}
            onChange={e => setGoogleSiteVerification(e.target.value)}
            placeholder="Content value from meta tag"
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gtm">Google Tag Manager container ID</Label>
          <Input
            id="gtm"
            value={gtmId}
            onChange={e => setGtmId(e.target.value.toUpperCase())}
            placeholder="GTM-XXXXXXX"
            maxLength={20}
          />
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="domain">
          Custom domain <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="domain"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="e.g. inventory.apolloauto.com"
        />
        <p className="text-xs text-muted-foreground">Contact support to activate a custom domain after entering it here.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save settings'}
      </Button>
      </div>

      <aside className="hidden lg:block pt-2">
        <p className="text-xs font-medium text-muted-foreground mb-3">Live preview</p>
        <WebsitePreviewPanel
          businessName={businessName}
          tagline={tagline}
          heroHeadline={heroHeadline}
          heroSubline={heroSubline}
          specialtyTags={previewTags}
          serviceArea={serviceArea}
          theme={theme}
          logoUrl={logoUrl}
        />
      </aside>
    </div>
  )
}
