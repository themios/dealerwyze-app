'use client'

import type { CSSProperties } from 'react'
import type { ThemeColors } from '@/lib/dealer-public/personalization'

/** Compact read-only mock of the public inventory hero + header chips (settings sidebar). */
export default function WebsitePreviewPanel({
  businessName,
  tagline,
  heroHeadline,
  heroSubline,
  specialtyTags,
  serviceArea,
  theme,
  logoUrl,
}: {
  businessName: string
  tagline: string
  heroHeadline: string
  heroSubline: string
  specialtyTags: string[]
  serviceArea: string
  theme: ThemeColors
  logoUrl: string
}) {
  const scriptLine = heroSubline.trim() || tagline.trim() || 'Quality pre-owned vehicles'
  const titleLine = heroHeadline.trim() || 'Browse our inventory'

  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden text-left"
      style={
        {
          borderColor: `${theme.gold}55`,
          background: `linear-gradient(135deg, ${theme.navy} 0%, ${theme.navyDeep} 100%)`,
        } as CSSProperties
      }
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: `${theme.gold}44` }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border text-[10px] font-semibold text-white"
          style={{
            borderColor: `${theme.gold}66`,
            backgroundColor: `${theme.navyLight}cc`,
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of user logo URL
            <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-1 text-center leading-tight">Logo</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{businessName || 'Your dealership'}</p>
          {tagline.trim() ? (
            <p className="truncate text-[10px] text-white/70">{tagline}</p>
          ) : (
            <p className="truncate text-[10px] text-white/45">Tagline from settings</p>
          )}
        </div>
      </div>
      <div className="px-3 py-4 text-white">
        <p className="text-xs font-medium leading-snug" style={{ color: theme.goldLight }}>
          {scriptLine}
        </p>
        <h3 className="mt-1.5 font-semibold text-sm leading-tight text-white">{titleLine}</h3>
        <p className="mt-2 text-[10px] text-white/75">Preview only — counts and inventory load on the live site.</p>
        {specialtyTags.length ? (
          <ul className="mt-3 flex flex-wrap gap-1" aria-hidden>
            {specialtyTags.slice(0, 6).map(t => (
              <li
                key={t}
                className="rounded-full border px-2 py-0.5 text-[9px] font-medium"
                style={{
                  borderColor: `${theme.gold}44`,
                  backgroundColor: `${theme.navyLight}66`,
                  color: theme.goldLight,
                }}
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}
        {serviceArea.trim() ? (
          <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-white/70">{serviceArea}</p>
        ) : null}
      </div>
    </div>
  )
}
