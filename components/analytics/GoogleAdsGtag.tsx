'use client'

import { useEffect } from 'react'

const GTAG_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? ''

/**
 * Injects gtag.js + inline config into document.head after mount.
 * Avoids next/script in the React tree — React 19 warns on <script> during client render.
 */
export default function GoogleAdsGtag() {
  useEffect(() => {
    if (!GTAG_ID || typeof document === 'undefined') return
    if (document.getElementById('google-ads-gtag-js')) return

    const ext = document.createElement('script')
    ext.id = 'google-ads-gtag-js'
    ext.async = true
    ext.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GTAG_ID)}`
    document.head.appendChild(ext)

    const init = document.createElement('script')
    init.id = 'google-ads-gtag-inline'
    init.textContent = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(GTAG_ID)}, { send_page_view: true });
`.trim()
    document.head.appendChild(init)
  }, [])

  return null
}
