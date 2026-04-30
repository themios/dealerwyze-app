'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { firePageView } from '@/lib/analytics/gtag'

/**
 * Fires a gtag page_view on every client-side route change.
 *
 * Next.js App Router uses React Server Components and client-side navigation via
 * <Link>. The global gtag('config', ...) in layout.tsx only fires once on the
 * initial HTML load. This provider covers all subsequent navigations so that:
 *   - The remarketing audience is built on every page, not just entry pages.
 *   - Funnel data (/lp → /signup) is visible in Google Ads reports.
 *
 * Renders nothing. Mount once in the root layout inside the <body>.
 */
export default function AnalyticsProvider() {
  const pathname = usePathname()

  useEffect(() => {
    firePageView(pathname)
  }, [pathname])

  return null
}
