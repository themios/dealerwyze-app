'use client'

import { useState, useEffect } from 'react'

export interface OrgSettings {
  dealerName:    string
  dealerPhone:   string
  dealerAddress: string
  /** Base URL for dealer website (e.g. https://www.apolloauto-em.com) */
  dealerWebsiteUrl?: string | null
  /** Path to inventory/cars-for-sale page (e.g. /cars-for-sale) */
  dealerWebsiteInventoryPath?: string | null
}

const DEFAULT: OrgSettings = { dealerName: 'the dealership', dealerPhone: '', dealerAddress: '' }

// Module-level cache — one fetch per page load across all components
let _promise: Promise<OrgSettings> | null = null
let _cached:  OrgSettings | null = null

export function useOrgSettings(): OrgSettings {
  const [settings, setSettings] = useState<OrgSettings>(_cached ?? DEFAULT)

  useEffect(() => {
    if (!_promise) {
      _promise = fetch('/api/settings/org')
        .then(r => r.ok ? r.json() : null)
        .then((data: Record<string, string | null> | null) => {
          const s: OrgSettings = {
            dealerName:    data?.business_name ?? data?.name ?? 'the dealership',
            dealerPhone:   data?.dealer_cell_number ?? '',
            dealerAddress: data?.business_address ?? '',
            dealerWebsiteUrl: data?.dealer_website_url ?? null,
            dealerWebsiteInventoryPath: data?.dealer_website_inventory_path ?? '/cars-for-sale',
          }
          _cached = s
          return s
        })
        .catch(() => DEFAULT)
    }
    let cancelled = false
    _promise.then(s => {
      if (!cancelled) setSettings(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return settings
}
