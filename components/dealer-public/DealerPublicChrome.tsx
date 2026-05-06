import Link from 'next/link'
import type { ReactNode } from 'react'
import { absoluteUrl, DEALER_THEME_DEFAULT_LOGO_PATH } from '@/lib/dealer-public/site'
import type { WebsiteSocial } from '@/lib/dealer-public/personalization'

export interface DealerPublicContact {
  displayName: string
  tagline: string | null
  slug: string
  logoSrc: string | null
  address: string | null
  zipCode: string | null
  /** Primary business line */
  phone: string | null
  /** SMS / voice line when business phone empty */
  secondaryPhone: string | null
  email: string | null
  externalWebsite: string | null
  /** Optional hours copy for footer (from website settings). */
  hours: string | null
  social: WebsiteSocial
  /** True when dealer has story copy — nav links to inventory#about. */
  showAboutInNav: boolean
  specialtyTags: string[]
  serviceArea: string | null
  establishedYear: number | null
  awards: string | null
  ctaLabel: string | null
  /** Resolved absolute URL (https or site base + path). */
  ctaHref: string | null
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return '#'
  if (digits.length === 10) return `tel:+1${digits}`
  return `tel:+${digits}`
}

export default function DealerPublicChrome({
  contact,
  children,
}: {
  contact: DealerPublicContact
  children: ReactNode
}) {
  const logoUrl = contact.logoSrc?.trim()
    ? contact.logoSrc
    : absoluteUrl(DEALER_THEME_DEFAULT_LOGO_PATH)

  const invHref = `/${contact.slug}/inventory`
  const phones = [contact.phone, contact.secondaryPhone].filter(
    (p, i, arr) => p && arr.indexOf(p) === i,
  ) as string[]

  const socialEntries = (
    [
      ['Facebook', contact.social.facebook],
      ['Instagram', contact.social.instagram],
      ['YouTube', contact.social.youtube],
      ['TikTok', contact.social.tiktok],
      ['X', contact.social.x],
    ] as const
  ).filter(([, url]) => url)

  return (
    <div className="dealer-public-root min-h-screen flex flex-col bg-[var(--dp-cream)] text-[var(--dp-ink)]">
      <a
        href="#dealer-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[var(--dp-navy)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to inventory
      </a>

      <header className="border-b border-[var(--dp-gold)]/30 bg-[var(--dp-navy)] text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href={invHref} className="flex items-center gap-4 min-w-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote dealer logos + static fallback */}
            <img
              src={logoUrl}
              alt={`${contact.displayName} logo`}
              width={160}
              height={56}
              fetchPriority="high"
              decoding="async"
              className="h-12 w-auto max-w-[200px] object-contain shrink-0 drop-shadow-sm transition-opacity group-hover:opacity-90"
            />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-dp-display)] text-lg font-semibold tracking-tight truncate">
                {contact.displayName}
              </p>
              {contact.tagline ? (
                <p className="text-sm text-white/75 font-[family-name:var(--font-dp-body)] line-clamp-2">
                  {contact.tagline}
                </p>
              ) : null}
            </div>
          </Link>

          <nav
            aria-label="Dealer website"
            className="flex flex-wrap items-center gap-2 sm:justify-end"
          >
            <Link
              href={invHref}
              className="rounded-md border border-[var(--dp-gold)]/60 bg-[var(--dp-navy-light)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dp-navy-light)]/80 transition-colors"
            >
              View inventory
            </Link>
            {contact.showAboutInNav ? (
              <Link
                href={`${invHref}#about`}
                className="rounded-md border border-white/25 bg-transparent px-4 py-2 text-sm font-medium text-white/95 hover:bg-white/10 transition-colors"
              >
                About us
              </Link>
            ) : null}
            {contact.ctaHref ? (
              <a
                href={contact.ctaHref}
                className="rounded-md bg-[var(--dp-gold)] px-4 py-2 text-sm font-semibold text-[var(--dp-navy)] hover:brightness-110 transition-[filter]"
                {...(contact.ctaHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {contact.ctaLabel || 'Contact us'}
              </a>
            ) : null}
            {phones[0] ? (
              <a
                href={telHref(phones[0])}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-[filter] ${
                  contact.ctaHref
                    ? 'border border-[var(--dp-gold)]/70 bg-transparent text-white hover:bg-white/10'
                    : 'bg-[var(--dp-gold)] text-[var(--dp-navy)] hover:brightness-110'
                }`}
              >
                Call {phones[0]}
              </a>
            ) : null}
          </nav>
        </div>
      </header>

      <main id="dealer-main" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-5 sm:px-4 sm:pb-14 sm:pt-6 lg:px-6">
          <div className="rounded-2xl border border-[var(--dp-navy)]/14 bg-[var(--dp-warm-white)] px-3 py-5 shadow-[0_1px_2px_rgba(26,52,94,0.06)] sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-[var(--dp-navy)]/10 bg-[var(--dp-warm-white)]">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h2 className="font-[family-name:var(--font-dp-display)] text-sm font-semibold uppercase tracking-wider text-[var(--dp-navy)]">
                Visit us
              </h2>
              {contact.address ? (
                <address className="mt-2 not-italic text-sm text-[var(--dp-ink)]/85 leading-relaxed whitespace-pre-line">
                  {contact.address}
                  {contact.zipCode ? (
                    <>
                      <br />
                      {contact.zipCode}
                    </>
                  ) : null}
                </address>
              ) : (
                <p className="mt-2 text-sm text-[var(--dp-ink)]/60">Address on file — add it in Settings → Organization or Website.</p>
              )}
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-dp-display)] text-sm font-semibold uppercase tracking-wider text-[var(--dp-navy)]">
                Contact
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {phones.map(p => (
                  <li key={p}>
                    <a href={telHref(p)} className="text-[var(--dp-navy)] underline-offset-2 hover:underline">
                      {p}
                    </a>
                  </li>
                ))}
                {contact.email ? (
                  <li>
                    <a
                      href={`mailto:${encodeURIComponent(contact.email)}`}
                      className="text-[var(--dp-navy)] underline-offset-2 hover:underline break-all"
                    >
                      {contact.email}
                    </a>
                  </li>
                ) : null}
                {!phones.length && !contact.email ? (
                  <li className="text-[var(--dp-ink)]/60">Add phone or email in Settings.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-dp-display)] text-sm font-semibold uppercase tracking-wider text-[var(--dp-navy)]">
                Hours
              </h2>
              {contact.hours ? (
                <p className="mt-2 text-sm text-[var(--dp-ink)]/85 whitespace-pre-line leading-relaxed">{contact.hours}</p>
              ) : (
                <p className="mt-2 text-sm text-[var(--dp-ink)]/60">Add hours in Website settings.</p>
              )}
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-dp-display)] text-sm font-semibold uppercase tracking-wider text-[var(--dp-navy)]">
                Dealer
              </h2>
              <p className="mt-2 text-sm text-[var(--dp-ink)]/85">{contact.displayName}</p>
              {contact.establishedYear ? (
                <p className="mt-1 text-xs text-[var(--dp-ink)]/60">Established {contact.establishedYear}</p>
              ) : null}
              {contact.awards ? (
                <p className="mt-1 text-xs text-[var(--dp-ink)]/70 leading-snug">{contact.awards}</p>
              ) : null}
              {contact.externalWebsite ? (
                <a
                  href={contact.externalWebsite.startsWith('http') ? contact.externalWebsite : `https://${contact.externalWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-[var(--dp-navy)] underline-offset-2 hover:underline"
                >
                  Official website
                </a>
              ) : null}
              {socialEntries.length ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {socialEntries.map(([label, url]) => (
                    <li key={label}>
                      <a
                        href={url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--dp-navy)] underline-offset-2 hover:underline"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center gap-2 border-t border-[var(--dp-navy)]/10 pt-6 text-center text-xs text-[var(--dp-ink)]/50">
            <p>
              &copy; {new Date().getFullYear()} {contact.displayName}. All rights reserved.
            </p>
            <p>
              <span className="text-[var(--dp-ink)]/40">Powered by </span>
              <a
                href="https://dealerwyze.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--dp-navy)]/70 hover:text-[var(--dp-navy)] hover:underline"
              >
                DealerWyze
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
