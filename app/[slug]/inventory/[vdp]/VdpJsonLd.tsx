import { jsonLdInline } from '@/lib/dealer-public/site'

/** Server-only JSON-LD script — kept separate from the page module to avoid client-bundle edge cases. */
export default function VdpJsonLd({ payload }: { payload: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdInline(payload) }}
      suppressHydrationWarning
    />
  )
}
