/**
 * Google Ads / gtag helpers
 *
 * UTM flow:
 *   1. captureUtmParams()    — call on any landing page to persist UTMs to sessionStorage
 *   2. readStoredUtmParams() — call on signup page to retrieve them for the API payload
 *   3. clearStoredUtmParams() — call after successful signup
 *
 * Conversion flow:
 *   fireSignupConversion() — call after the user is signed in (not on the thank-you page view,
 *   which can be refreshed, but after the API confirms account creation).
 */

export const GTAG_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? ''
export const CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? ''

const UTM_KEY = 'dw_utm'

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

/**
 * Read UTMs from current URL and write them to sessionStorage.
 * Genuinely first-touch: only writes if nothing is stored yet.
 * A subsequent tagged visit (e.g. a retargeting click) will NOT overwrite
 * the original acquisition source captured from the first paid-search click.
 * Call on every landing page and on /signup mount.
 */
export function captureUtmParams(): void {
  if (typeof window === 'undefined') return
  // First-touch guard: if UTMs are already stored, do not overwrite them.
  try {
    if (sessionStorage.getItem(UTM_KEY)) return
  } catch { return }

  const sp = new URLSearchParams(window.location.search)
  const params: UtmParams = {}
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
  let found = false
  for (const k of keys) {
    const v = sp.get(k)
    if (v) { params[k] = v; found = true }
  }
  if (found) {
    try { sessionStorage.setItem(UTM_KEY, JSON.stringify(params)) } catch { /* storage blocked */ }
  }
}

/** Retrieve stored UTMs on the signup page to send with the registration payload. */
export function readStoredUtmParams(): UtmParams {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(UTM_KEY)
    return raw ? (JSON.parse(raw) as UtmParams) : {}
  } catch {
    return {}
  }
}

/** Remove stored UTMs after they have been sent to the API. */
export function clearStoredUtmParams(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(UTM_KEY) } catch { /* storage blocked */ }
}

/** Fire a Google Ads conversion event after successful account creation. */
export function fireSignupConversion(): void {
  if (typeof window === 'undefined') return
  if (!GTAG_ID || !CONVERSION_LABEL) return
  try {
    // gtag is injected by the <Script> tag in app/layout.tsx
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof g === 'function') {
      g('event', 'conversion', { send_to: `${GTAG_ID}/${CONVERSION_LABEL}` })
    }
  } catch { /* gtag not loaded */ }
}

/** Fire a gtag page_view for the remarketing audience. Called automatically via the global tag. */
export function firePageView(url: string): void {
  if (typeof window === 'undefined') return
  if (!GTAG_ID) return
  try {
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof g === 'function') {
      g('event', 'page_view', { page_path: url })
    }
  } catch { /* gtag not loaded */ }
}
